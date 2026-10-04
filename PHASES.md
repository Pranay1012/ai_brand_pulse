# BrandPulse AI — Build Phases

Work through phases **in order**. Each phase = one git branch = one small, testable piece.
Architecture reference: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## How to use this file

For **every** phase:

1. `git checkout main && git pull` (pull once you configure a GitHub remote)
2. `git checkout -b phase-N-short-name`
3. Build the steps.
4. Run the **Test checklist**. All boxes ticked? Continue. Otherwise fix first.
5. Commit often (`git add . && git commit -m "message"`).
6. When done, follow the **Git: merge** section of that phase.
7. Tell me "Phase N done" (paste test output if anything failed) and I'll review and tell you when to merge.

### Git cheat sheet

| Goal | Command |
|---|---|
| See what changed | `git status` / `git diff` |
| Stage + commit | `git add .` then `git commit -m "feat: ..."` |
| Push your branch | `git push -u origin phase-N-short-name` (first time) / `git push` |
| Merge (local) | `git checkout main` → `git merge --no-ff phase-N-short-name` |
| Push main | `git push origin main` |
| Delete finished branch | `git branch -d phase-N-short-name` |
| Undo unstaged edits to a file | `git restore <file>` |
| See history | `git log --oneline --graph -15` |

**Commit message style:** `feat:` new feature · `fix:` bug fix · `test:` tests · `docs:` docs · `chore:` maintenance.

**When is it safe to merge to `main`?** All three must be true:
1. The phase's test checklist is fully ticked.
2. `git status` is clean (everything committed, no `.env` or secrets in the commit).
3. The code compiles and tests pass without errors.

---

## Phase overview

| # | Branch | Service | What you build | Done when |
|---|---|---|---|---|
| 0 | `main` | All | Tool verification, Git repository, microservice folders | `git log` shows first commit |
| 1 | `phase-1-database` | Database | PostgreSQL 16 + pgvector schema (with Users & RBAC) | Tables exist in pgAdmin & vector enabled |
| 2 | `phase-2-ingestion-core` | Ingestion | Python Hacker News scraper + HTML cleaning + hashing | `pytest` passes, script prints mentions |
| 3 | `phase-3-redis-publish` | Ingestion | Redis 7-day deduplication + stream publishing (`bp:mentions`) | Messages visible in Redis stream |
| 4 | `phase-4-nlp-core` | AI Service | VADER sentiment scoring + MiniLM 384-d embeddings | `pytest` passes with unit tests |
| 5 | `phase-5-ai-service` | AI Service | FastAPI microservice (:8000) + Redis stream consumer + pgvector clustering | Mentions & clusters saved to Postgres |
| 6 | `phase-6-action-synthesis`| AI Service | Cluster trigger evaluation + LLM Action drafting (Mock/Ollama) | Draft Jira action created with `status: pending` |
| 7 | `phase-7-gateway-auth` | Gateway | Node.js Express (:3000) + JWT Auth + Workspaces/Brands CRUD | Register/Login works, returns JWT |
| 8 | `phase-8-gateway-actions`| Gateway | Action Triage state machine (Approve / Reject / Execute) with RBAC | Triage endpoints tested and working |
| 9 | `phase-9-extras` | Multiple | Ollama local LLM integration & Google News feed adapter | Live end-to-end data processing |
| 10 | `phase-10-docker` | All | Docker Compose orchestration for all 3 microservices + DB + Redis | `docker compose up` starts full stack |
| 11 | `phase-11-react-ui` | Frontend | React (Vite) Dashboard: Radar, Action Triage Kanban, Settings | Interactive UI connected to Express Gateway |

---

## Phase 0 — Setup, Environment & Git

**Branch:** Committed straight to `main` (project setup).  
**Goal:** Verify prerequisites, initialize the Git repository, configure `.gitignore`, and set up the microservice folder structure.

### 1. Prerequisites (Windows)

| Tool | Recommended Installation | Verification Command |
|---|---|---|
| **Git** | git-scm.com installer | `git --version` |
| **Python 3.12+** | python.org (ensure "Add to PATH" is ticked) | `python --version` |
| **Node.js 22 LTS** | nodejs.org installer | `node --version` |
| **PostgreSQL 16 + pgvector** | **Option A (Easiest):** In Docker Desktop, run: `docker run -d --name brandpulse-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16`<br>**Option B (Native):** Install Postgres 16 and copy pgvector release DLLs into PostgreSQL directories. | Connect with pgAdmin 4 |
| **pgAdmin 4** | Installed with Postgres or from pgadmin.org | Connect to localhost:5432 |
| **Redis** | **Memurai Developer** (Windows native Redis) from memurai.com or WSL `redis-server` | `memurai-cli ping` or `redis-cli ping` → `PONG` |

### 2. Steps to execute

1. In the project root (`c:\Pranay\Projects\ai_brand_pulse`):
   ```powershell
   git init -b main
   ```
2. Create `.gitignore` to protect virtual environments, node modules, and secrets:
   ```gitignore
   # Secrets & Environment variables
   .env
   .env.*
   !.env.example

   # Python
   __pycache__/
   *.pyc
   .venv/
   .pytest_cache/

   # Node.js
   node_modules/
   dist/
   npm-debug.log*

   # IDE
   .vscode/
   .idea/
   ```
3. Create the microservice folder structure with `.gitkeep` files:
   - `db/`
   - `ingestion/`
   - `ai_service/`
   - `gateway/`
4. Stage and commit:
   ```powershell
   git add .
   git commit -m "chore: initial microservices architecture and project structure"
   ```
5. *(Optional but recommended)* Link your GitHub repository:
   ```powershell
   git remote add origin https://github.com/<your-username>/ai_brand_pulse.git
   git push -u origin main
   ```

### Test checklist
- [ ] `git status` shows working tree clean
- [ ] `git log --oneline` shows initial commit
- [ ] `python`, `node`, `git` all return expected versions
- [ ] PostgreSQL + pgvector is reachable on port 5432
- [ ] Redis responds to `ping` with `PONG` on port 6379

---

## Phase 1 — Database Schema & Seed Data

**Branch:** `git checkout -b phase-1-database`  
**Goal:** Create the `brandpulse` database with PostgreSQL 16 + pgvector, including Users, Workspaces, Brands, Mentions, Clusters, and Actions.

### Steps
1. In pgAdmin: right-click **Databases → Create → Database** → name `brandpulse`.
2. Save the script below as `db/schema.sql`.
3. In pgAdmin: right-click `brandpulse` → **Query Tool** → open `db/schema.sql` → press **F5**.

```sql
-- db/schema.sql (PostgreSQL 16 + pgvector)

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Users & Authentication
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  password_hash text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Workspaces & Memberships
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('admin', 'responder', 'viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 3. Tracked Brands
CREATE TABLE tracked_brands (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              text NOT NULL,
  keywords          text[] NOT NULL CHECK (cardinality(keywords) > 0),
  competitor_names  text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX idx_tracked_brands_active ON tracked_brands (id) WHERE is_active;

-- 4. Issue Clusters
CREATE TABLE issue_clusters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES tracked_brands(id) ON DELETE CASCADE,
  title           text NOT NULL,
  centroid        vector(384) NOT NULL,
  mention_count   integer NOT NULL DEFAULT 1,
  negative_count  integer NOT NULL DEFAULT 0,
  avg_sentiment   real NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
  first_seen_at   timestamptz NOT NULL,
  last_seen_at    timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clusters_brand ON issue_clusters (brand_id, status, last_seen_at DESC);

-- 5. Mentions
CREATE TABLE mentions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES tracked_brands(id) ON DELETE CASCADE,
  cluster_id       uuid REFERENCES issue_clusters(id) ON DELETE SET NULL,
  source           text NOT NULL,
  external_id      text NOT NULL,
  url              text NOT NULL,
  author           text,
  title            text NOT NULL DEFAULT '',
  content          text NOT NULL,
  content_hash     char(64) NOT NULL,
  published_at     timestamptz NOT NULL,
  sentiment_score  real NOT NULL,
  sentiment_label  text NOT NULL CHECK (sentiment_label IN ('negative', 'neutral', 'positive')),
  embedding        vector(384) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, content_hash)
);
CREATE INDEX idx_mentions_cluster ON mentions (cluster_id);

-- 6. Actions
CREATE TABLE actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id    uuid NOT NULL REFERENCES issue_clusters(id) ON DELETE CASCADE,
  brand_id      uuid NOT NULL REFERENCES tracked_brands(id) ON DELETE CASCADE,
  action_type   text NOT NULL CHECK (action_type IN ('jira_ticket', 'pr_response', 'sales_counter_hook')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  payload       jsonb NOT NULL,
  rationale     text NOT NULL,
  reviewed_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  reject_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);
CREATE UNIQUE INDEX uq_live_action ON actions (cluster_id, action_type) WHERE status IN ('pending', 'approved');

-- 7. Seed Data
INSERT INTO workspaces (id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'Demo Workspace');
INSERT INTO tracked_brands (id, workspace_id, name, keywords, competitor_names) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Vercel', ARRAY['vercel'], ARRAY['Netlify']);
```

### Test checklist
- [ ] `SELECT '[1,2,3]'::vector;` runs in pgAdmin with 0 errors
- [ ] pgAdmin displays all 7 tables under `brandpulse → Schemas → public → Tables`
- [ ] `SELECT * FROM tracked_brands;` returns the Vercel row

### Git: Merge
```powershell
git add db/schema.sql
git commit -m "feat(db): initialize database schema with pgvector and RBAC"
git checkout main
git merge --no-ff phase-1-database
git push origin main
```

---

## Phase 2 — Ingestion Core (Python)

**Branch:** `git checkout -b phase-2-ingestion-core`  
**Goal:** Build pure functions that fetch Hacker News discussions, sanitize HTML, and compute deterministic content hashes.

### Steps
1. In `ingestion/`:
   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install httpx beautifulsoup4 pytest
   pip freeze > requirements.txt
   ```
2. Build `src/cleaning.py`:
   - `clean_html(raw_html: str) -> str`: strips tags, unescapes entities, collapses whitespace, limits to 4000 characters.
   - `make_content_hash(brand_id: str, title: str, content: str) -> str`: produces a SHA-256 hex digest.
3. Build `src/adapters.py`:
   - `fetch_hacker_news(client: httpx.Client, keyword: str) -> list[dict]`: hits `https://hn.algolia.com/api/v1/search_by_date` and formats into normalized mention dicts.
4. Add unit tests in `tests/test_cleaning.py` and `tests/test_adapters.py`.

### Test checklist
- [ ] `pytest` in `ingestion/` passes 100%
- [ ] `clean_html("<p>Vercel <b>down</b></p>")` yields `"Vercel down"`
- [ ] Identical text produces identical hashes regardless of capitalization or extra whitespace

### Git: Merge
```powershell
git add ingestion/
git commit -m "feat(ingestion): HN fetcher, HTML sanitizer, and SHA-256 hashing"
git checkout main
git merge --no-ff phase-2-ingestion-core
git push origin main
```

---

## Phase 3 — Redis Ingestion Publishing

**Branch:** `git checkout -b phase-3-redis-publish`  
**Goal:** Ingestion service queries active brands from PostgreSQL, checks Redis for duplicates, and publishes new mentions to stream `bp:mentions`.

### Steps
1. Add dependencies: `pip install redis psycopg[binary] python-dotenv fakeredis`.
2. Create `.env.example` in `ingestion/`:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/brandpulse
   REDIS_URL=redis://localhost:6379
   INGEST_INTERVAL_SECONDS=300
   ```
3. Build `src/publisher.py`:
   - `is_new_mention(redis_client, brand_id, content_hash) -> bool`: uses `SET key 1 NX EX 604800` (7 days).
   - `publish_mention(redis_client, mention_dict)`: calls `XADD bp:mentions MAXLEN ~ 100000 * type mention.ingested payload <json>`.
4. Build `src/main.py`: scheduled loop fetching brands and publishing new mentions.

### Test checklist
- [ ] Unit tests with `fakeredis` verify that duplicate hashes return `False`
- [ ] In `memurai-cli` / `redis-cli`: `XLEN bp:mentions` increments upon ingestion

### Git: Merge
```powershell
git add ingestion/
git commit -m "feat(ingestion): Redis 7-day deduplication and stream publishing"
git checkout main
git merge --no-ff phase-3-redis-publish
git push origin main
```

---

## Phase 4 — AI & NLP Core (Python)

**Branch:** `git checkout -b phase-4-nlp-core`  
**Goal:** Implement sentiment analysis and 384-dimensional vector embedding pure functions in `ai_service/`.

### Steps
1. In `ai_service/`:
   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install vaderSentiment sentence-transformers pytest numpy
   pip freeze > requirements.txt
   ```
2. Build `src/sentiment.py`:
   - `analyze_sentiment(text: str) -> tuple[float, str]`: returns compound score (-1.0 to 1.0) and label (`negative`, `neutral`, `positive`).
3. Build `src/embedding.py`:
   - `get_embedding(text: str) -> list[float]`: uses `sentence-transformers/all-MiniLM-L6-v2` to produce a normalized 384-dimensional vector.
4. Unit tests in `tests/test_nlp.py`.

### Test checklist
- [ ] `pytest` passes
- [ ] `get_embedding("504 timeout error")` returns exactly 384 floats with vector norm ≈ 1.0
- [ ] Negative sentences correctly labeled `negative`

### Git: Merge
```powershell
git add ai_service/
git commit -m "feat(ai): VADER sentiment analysis and MiniLM 384-d embeddings"
git checkout main
git merge --no-ff phase-4-nlp-core
git push origin main
```

---

## Phase 5 — AI Service & pgvector Clustering (FastAPI)

**Branch:** `git checkout -b phase-5-ai-service`  
**Goal:** Build the FastAPI service (:8000) that exposes AI/ML endpoints and runs a background consumer draining Redis stream `bp:mentions` into PostgreSQL clusters.

### Steps
1. Install dependencies in `ai_service/`:
   `pip install fastapi uvicorn[standard] psycopg[binary] pgvector python-dotenv fakeredis`
2. Build `src/db.py`:
   - Connects to Postgres and registers vector support: `register_vector(conn)`.
   - `find_nearest_cluster(brand_id, embedding)`:
     ```sql
     SELECT id, centroid <=> %(emb)s AS distance
     FROM issue_clusters
     WHERE brand_id = %(brand_id)s
       AND status = 'open'
       AND last_seen_at > now() - interval '30 days'
     ORDER BY distance
     LIMIT 1;
     ```
   - `create_cluster(...)` and `add_to_cluster(...)` updating the running centroid.
3. Build `src/api.py` (FastAPI app):
   - `GET /health`
   - `POST /embed` (for internal on-demand embeddings)
   - `POST /sentiment` (for on-demand sentiment scoring)
4. Build `src/consumer.py`: consumer loop reading from Redis stream `bp:mentions` and updating Postgres.

### Test checklist
- [ ] FastAPI starts on port 8000 (`uvicorn src.api:app --reload --port 8000`)
- [ ] `curl http://localhost:8000/health` returns `{"status":"ok"}`
- [ ] Running consumer processes stream messages and clusters appear in pgAdmin

### Git: Merge
```powershell
git add ai_service/
git commit -m "feat(ai): FastAPI service and pgvector clustering consumer"
git checkout main
git merge --no-ff phase-5-ai-service
git push origin main
```

---

## Phase 6 — Action Synthesis (LLM Drafting)

**Branch:** `git checkout -b phase-6-action-synthesis`  
**Goal:** Trigger rules in the AI Service evaluate cluster metrics and synthesize draft Jira bug tickets using an LLM provider (Mock or Ollama).

### Steps
1. Install `pydantic` in `ai_service/`.
2. Build `src/triggers.py`:
   - `evaluate_trigger(cluster) -> bool`: checks if `mention_count >= 5` and `negative_count / mention_count >= 0.6`.
3. Build `src/llm.py`:
   - `synthesize_action(cluster_title, mentions) -> dict`: outputs structured Jira ticket schema (`summary`, `description`, `priority`, `steps_to_reproduce`, `acceptance_criteria`).
   - Defaults to `LLM_PROVIDER=mock` for deterministic testing.
4. Update clustering flow: when trigger criteria are met and no active action exists, draft the action into the `actions` table with `status = 'pending'`.

### Test checklist
- [ ] 5 negative mentions trigger action generation
- [ ] Action row created with `status = 'pending'`
- [ ] Duplicate mentions do not generate duplicate actions for the same cluster

### Git: Merge
```powershell
git add ai_service/
git commit -m "feat(ai): cluster trigger evaluation and LLM action synthesis"
git checkout main
git merge --no-ff phase-6-action-synthesis
git push origin main
```

---

## Phase 7 — Express API Gateway & Auth

**Branch:** `git checkout -b phase-7-gateway-auth`  
**Goal:** Build the Node.js Express API Gateway (:3000) with JWT Authentication, Role-Based Access Control, and Brand/Workspace CRUD.

### Steps
1. In `gateway/`:
   ```powershell
   npm init -y
   npm i express cors jsonwebtoken bcryptjs pg zod dotenv
   npm i -D typescript tsx @types/node @types/express @types/cors @types/jsonwebtoken @types/bcryptjs @types/pg vitest supertest @types/supertest
   npx tsc --init
   ```
2. Build `src/middleware/auth.ts`:
   - `requireAuth`: validates JWT from `Authorization: Bearer <token>`.
   - `requireRole(allowedRoles)`: ensures user role matches permission level.
3. Build Auth Routes (`src/routes/auth.ts`):
   - `POST /api/auth/register` (creates user, demo workspace, hashes password with bcrypt, returns JWT).
   - `POST /api/auth/login` (verifies password, signs JWT).
   - `GET /api/auth/me` (returns user info and workspace role).
4. Build Brand Routes (`src/routes/brands.ts`):
   - `GET /api/brands` (requires `viewer+`).
   - `POST /api/brands` (requires `admin`).

### Test checklist
- [ ] `npm run dev` starts Express on port 3000
- [ ] User registration returns valid JWT
- [ ] Protected endpoints reject unauthenticated requests with `401`
- [ ] Viewers cannot create brands (`403 Forbidden`)

### Git: Merge
```powershell
git add gateway/
git commit -m "feat(gateway): Express API Gateway with JWT Auth and RBAC"
git checkout main
git merge --no-ff phase-7-gateway-auth
git push origin main
```

---

## Phase 8 — Action Triage Lifecycle in Gateway

**Branch:** `git checkout -b phase-8-gateway-actions`  
**Goal:** Action triage endpoints in Express allowing humans to approve, reject, or execute drafted actions.

### Steps
1. Build `src/routes/actions.ts`:
   - `GET /api/actions?status=pending` (lists draft inbox).
   - `POST /api/actions/:id/approve` (transitions `pending → approved`, requires `responder` or `admin`).
   - `POST /api/actions/:id/reject` (requires `{ reason }`, transitions `pending → rejected`).
   - `POST /api/actions/:id/execute` (transitions `approved → executed`).
2. Build atomic state transitions in SQL to avoid race conditions.

### Test checklist
- [ ] `pending → approve` succeeds with `200`
- [ ] Approving an already approved action returns `409 Conflict`
- [ ] Supertest integration tests pass

### Git: Merge
```powershell
git add gateway/
git commit -m "feat(gateway): action lifecycle state machine with triage endpoints"
git checkout main
git merge --no-ff phase-8-gateway-actions
git push origin main
```

---

## Phase 9 — Extras (Ollama & Feed Adapters)

**Branch:** `git checkout -b phase-9-extras`  
- Connect **Ollama** local LLM (`llama3.2:3b`) in `ai_service/`.
- Add Google News RSS feed adapter in `ingestion/`.

---

## Phase 10 — Docker Compose Orchestration

**Branch:** `git checkout -b phase-10-docker`  
- Dockerize all three microservices (`gateway/`, `ai_service/`, `ingestion/`).
- Orchestrate with `docker-compose.yml` linking Postgres and Redis.

---

## Phase 11 — React Dashboard

**Branch:** `git checkout -b phase-11-react-ui`  
- Build interactive frontend using React + Vite + TypeScript.
- Connect to Express Gateway (:3000).

---

## Ready to Start?

Ask me whenever you're ready to execute each step, or if you hit any roadblocks!
