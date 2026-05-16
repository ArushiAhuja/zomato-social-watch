CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  website TEXT,
  description TEXT,
  competitors TEXT[] DEFAULT '{}',
  onboarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

CREATE TABLE IF NOT EXISTS source_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  credentials JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, source)
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  severity INTEGER DEFAULT 10,
  color TEXT DEFAULT '#6366f1',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_ids UUID[] DEFAULT '{}',
  score_threshold INTEGER DEFAULT 60,
  action_type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT,
  body TEXT,
  author TEXT,
  url TEXT,
  raw_engagement INTEGER DEFAULT 0,
  escalation_score INTEGER DEFAULT 0,
  category_id UUID REFERENCES categories(id),
  sentiment_intensity INTEGER DEFAULT 0,
  reasoning TEXT,
  escalated BOOLEAN DEFAULT FALSE,
  reviewed BOOLEAN DEFAULT FALSE,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  post_created_at TIMESTAMPTZ,
  UNIQUE(org_id, source, external_id)
);

CREATE TABLE IF NOT EXISTS refresh_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  posts_fetched INTEGER DEFAULT 0,
  posts_escalated INTEGER DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS posts_org_id_idx ON posts(org_id);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts(fetched_at DESC);
CREATE INDEX IF NOT EXISTS posts_escalated_idx ON posts(org_id, escalated) WHERE escalated = true;
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts(org_id, category_id);
