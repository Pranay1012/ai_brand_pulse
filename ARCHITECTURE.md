# BrandPulse AI — Microservices Architecture

> Companion: [`PHASES.md`](./PHASES.md) — step-by-step build guide with git branching.
> Built as a clean, decoupled microservices architecture.

---

## 1. Product in One Paragraph

Social-listening tools dump thousands of disconnected posts and a vague "64% positive" on a team.
**BrandPulse AI** turns public brand mentions into structured work:
1. **Ingests** public discussions (Hacker News, etc.).
2. **Clusters** semantically similar complaints using vector embeddings (`pgvector`).
3. When a cluster crosses negative-sentiment thresholds, **drafts an action** (e.g., a Jira bug ticket or PR response) using an LLM.
4. Provides an **API Gateway with Auth** where humans review, approve, or reject actions.

---

## 2. Microservice Topology

The system is decoupled into three dedicated services communicating via Redis and REST:

```
                            CLIENTS / FUTURE REACT DASHBOARD
                                           │
                                           │ REST (JSON + JWT)
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │ 1. API GATEWAY & AUTH SERVICE                    │
                 │    Node.js + Express (Port 3000)                 │
                 │    • Authentication & JWT (Register/Login)       │
                 │    • Role-Based Access Control (Admin/Responder) │
                 │    • Workspaces & Tracked Brands CRUD            │
                 │    • Action Triage Lifecycle (Approve/Reject)    │
                 └─────────────┬──────────────────────┬─────────────┘
                               │                      │
                   SQL Queries │                      │ Internal REST
                               ▼                      ▼
┌─────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│ POSTGRESQL 16 + pgvector (Port 5432)    │   │ 2. AI & ML SERVICE                      │
│ • users, workspace_members              │   │    Python + FastAPI (Port 8000)         │
│ • workspaces, tracked_brands            │   │    • ONLY AI & ML Work                  │
│ • mentions (vector(384))                │◄──┤    • Sentiment scoring (VADER)          │
│ • issue_clusters (centroid vector(384)) │   │    • Embeddings (MiniLM-L6-v2)          │
│ • actions                               │   │    • pgvector clustering (<=> distance) │
└─────────────────────────────────────────┘   │    • Action synthesis (Ollama / Mock)   │
                                              │    • Redis Stream Consumer worker       │
                                              └───────────────────▲─────────────────────┘
                                                                  │
                                            XREADGROUP `bp:mentions`
                                                                  │
                                              ┌───────────────────┴─────────────────────┐
                                              │ REDIS 7 (Port 6379)                     │
                                              │ • Stream: `bp:mentions`                 │
                                              │ • Dedup keys: `bp:dedup:*`              │
                                              └───────────────────▲─────────────────────┘
                                                                  │
                                            XADD `bp:mentions`    │
                                                                  │
                                              ┌───────────────────┴─────────────────────┐
                                              │ 3. INGESTION SERVICE                    │
                                              │    Python (background worker)           │
                                              │    • Polls public feeds (Hacker News)   │
                                              │    • Cleans HTML & normalizes text      │
                                              │    • SHA-256 deduplication via Redis    │
                                              └───────────────────▲─────────────────────┘
                                                                  │
                                                                  │ HTTPS Polling
                                              ┌───────────────────┴─────────────────────┐
                                              │ PUBLIC FEEDS (Hacker News Algolia API)  │
                                              └─────────────────────────────────────────┘
```

---

## 3. Service Responsibilities Matrix

| Service | Stack | Port | Primary Responsibilities | What it does NOT do |
|---|---|---|---|---|
| **API Gateway & Auth** | Node.js, Express, TypeScript | `3000` | User registration & login, password hashing (bcrypt), JWT generation, RBAC checks, Workspaces & Brands CRUD, Action state machine (`pending → approved → executed \| rejected`). | Run ML/embeddings or poll external feeds. |
| **AI & ML Service** | Python 3.12, FastAPI, Uvicorn | `8000` | Exclusively AI/ML logic: sentiment analysis, 384-d vector embeddings, cluster assignment via `pgvector`, LLM action synthesis, background consumer loop draining `bp:mentions`. | Handle user authentication or web UI routing. |
| **Ingestion Service** | Python 3.12, httpx, bs4 | — | Periodic polling of public feeds, HTML cleaning, SHA-256 content hashing, fast 7-day Redis deduplication, stream publishing. | Compute embeddings, call LLMs, or mutate DB tables directly. |
| **PostgreSQL 16 + pgvector** | Database | `5432` | Source of truth and vector similarity search. | — |
| **Redis** | In-memory Broker | `6379` | Stream queue (`bp:mentions`) and deduplication cache. | Permanent data storage. |

---

## 4. Redis Keyspace & Messaging

| Key / Channel | Type | Producer → Consumer | Purpose |
|---|---|---|---|
| `bp:mentions` | Stream | Ingestion → AI Service | Buffer of normalized brand mentions. Consumer group: `ai-engine`. |
| `bp:dedup:{brand_id}:{content_hash}` | String | Ingestion → Ingestion | `SET NX EX 604800` (7 days TTL). Prevents re-publishing identical mentions. |

**Stream Mention Payload (`payload` JSON string):**
```json
{
  "brand_id": "33333333-3333-3333-3333-333333333333",
  "source": "hacker_news",
  "external_id": "900000001",
  "url": "https://news.ycombinator.com/item?id=900000001",
  "author": "someone",
  "title": "Vercel deploys failing with 504",
  "content": "Every deploy I push gets a 504 timeout.",
  "published_at": "2026-10-04T04:10:00Z",
  "content_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

---

## 5. Database Schema (PostgreSQL 16 + pgvector)

```
users 1 ──< workspace_members >── 1 workspaces 1 ──< tracked_brands 1 ──< mentions
                                                            │                  │
                                                            ├──< issue_clusters 1 ──< mentions (cluster_id)
                                                            └──< actions (cluster_id)
```

1. **`users`**: `id (uuid)`, `email (text unique)`, `password_hash (text)`, `name (text)`, `created_at`.
2. **`workspace_members`**: `workspace_id (uuid)`, `user_id (uuid)`, `role (text: 'admin'|'responder'|'viewer')`.
3. **`workspaces`**: `id (uuid)`, `name (text)`, `created_at`.
4. **`tracked_brands`**: `id (uuid)`, `workspace_id (uuid)`, `name (text)`, `keywords (text[])`, `competitor_names (text[])`, `is_active (bool)`.
5. **`issue_clusters`**: `id (uuid)`, `brand_id (uuid)`, `title (text)`, `centroid (vector(384))`, `mention_count (int)`, `negative_count (int)`, `avg_sentiment (real)`, `status (text: 'open'|'resolved'|'archived')`.
6. **`mentions`**: `id (uuid)`, `brand_id (uuid)`, `cluster_id (uuid)`, `source (text)`, `external_id (text)`, `url (text)`, `author (text)`, `title (text)`, `content (text)`, `content_hash (char(64))`, `published_at (timestamptz)`, `sentiment_score (real)`, `sentiment_label (text)`, `embedding (vector(384))`.
7. **`actions`**: `id (uuid)`, `cluster_id (uuid)`, `brand_id (uuid)`, `action_type (text)`, `status (text: 'pending'|'approved'|'rejected'|'executed')`, `payload (jsonb)`, `rationale (text)`, `reviewed_by (uuid)`.

---

## 6. AI & ML Pipeline (FastAPI Service :8000)

1. **Sentiment Analysis:** VADER compound score in `[-1.0, 1.0]`. Score `≤ -0.05` is negative.
2. **Embeddings:** `all-MiniLM-L6-v2` produces a 384-dimensional unit vector.
3. **Clustering via pgvector:**
   ```sql
   SELECT id, centroid <=> %(embedding)s AS distance
   FROM issue_clusters
   WHERE brand_id = %(brand_id)s
     AND status = 'open'
     AND last_seen_at > now() - interval '30 days'
   ORDER BY distance
   LIMIT 1;
   ```
   - If `distance < 0.22` (cosine similarity > 0.78): join the cluster and update the running centroid.
   - Otherwise: create a new cluster with `centroid = embedding`.
4. **Action Synthesis Trigger:**
   When a cluster reaches `mention_count ≥ 5` and `negative_ratio ≥ 0.6`, invoke the LLM (Ollama `llama3.2:3b` or Mock) to synthesize a structured Jira ticket saved as `status: 'pending'`.

---

## 7. API Gateway Surface (Express Service :3000)

### Auth & User Management
- `POST /api/auth/register` — Create user + workspace, hash password, return JWT.
- `POST /api/auth/login` — Validate credentials, return JWT.
- `GET /api/auth/me` — Return authenticated user profile and workspace role.

### Brand Management
- `GET /api/brands` — List tracked brands for workspace (`viewer+`).
- `POST /api/brands` — Add tracked brand (`admin` only).

### Clusters & Actions Triage
- `GET /api/clusters` — View open clusters with sentiment summaries.
- `GET /api/clusters/:id/mentions` — View real posts assigned to an issue cluster.
- `GET /api/actions?status=pending` — Action inbox.
- `POST /api/actions/:id/approve` — `pending → approved` (`responder` or `admin`).
- `POST /api/actions/:id/reject` — `pending → rejected` (requires `{ reason }`).
- `POST /api/actions/:id/execute` — `approved → executed`.

---

## 8. Repository Layout

```
ai_brand_pulse/
├── ARCHITECTURE.md
├── PHASES.md
├── .gitignore
├── db/
│   └── schema.sql
├── ingestion/                  # Python background worker
│   ├── requirements.txt
│   ├── .env.example
│   ├── src/ (adapters.py, cleaning.py, publisher.py, main.py)
│   └── tests/
├── ai_service/                 # Python + FastAPI (AI/ML microservice :8000)
│   ├── requirements.txt
│   ├── .env.example
│   ├── src/ (sentiment.py, embedding.py, clustering.py, llm.py, db.py, api.py, main.py)
│   └── tests/
└── gateway/                    # Node.js + Express (API Gateway & Auth :3000)
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── src/ (auth.ts, routes/, middleware/, db.ts, server.ts)
    └── tests/
```
