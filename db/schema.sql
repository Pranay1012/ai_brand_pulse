-- db/schema.sql (PostgreSQL 16 + pgvector)

-- Enable vector similarity search extension
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

-- 7. Seed Data for Development
INSERT INTO workspaces (id, name) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Demo Workspace')
ON CONFLICT DO NOTHING;

INSERT INTO tracked_brands (id, workspace_id, name, keywords, competitor_names) 
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Vercel', ARRAY['vercel'], ARRAY['Netlify'])
ON CONFLICT DO NOTHING;
