CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

CREATE TABLE brand_core (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  positioning text,
  tone text,
  guidelines jsonb,
  embedding_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  attributes jsonb,
  embedding_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  strategy jsonb,
  budget numeric(12,2),
  currency text,
  start_date date,
  end_date date,
  channels text[],
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'draft',
  data jsonb,
  storage_url text,
  tags text[] DEFAULT '{}',
  embedding_ref text,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  url_path text NOT NULL,
  page_schema jsonb,
  variant text,
  status text NOT NULL DEFAULT 'draft',
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, url_path)
);

CREATE TABLE affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text,
  referral_code text NOT NULL,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  payout_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, referral_code)
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text,
  phone text,
  name text,
  source text,
  status text NOT NULL DEFAULT 'new',
  attributes jsonb,
  landing_page_id uuid REFERENCES landing_pages(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text,
  template_id text,
  subject text,
  body text,
  channel text NOT NULL,
  schedule_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  metrics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE influencer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  influencer_id text,
  name text,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  contract jsonb,
  budget numeric(12,2),
  status text NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  performance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ad_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date date NOT NULL,
  network text NOT NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  ad_group_id text,
  ad_id text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  revenue numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date date NOT NULL,
  dimension text NOT NULL,
  dimension_id text,
  metrics jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE affiliate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  affiliate_id uuid REFERENCES affiliates(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  amount numeric(12,2),
  meta jsonb
);

CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source text,
  occurred_at timestamptz NOT NULL,
  session_id text,
  visitor_id text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  landing_page_id uuid REFERENCES landing_pages(id) ON DELETE SET NULL,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  ad_id text,
  meta jsonb,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX idx_tenants_id ON tenants(id);
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role);
CREATE INDEX idx_brand_core_tenant ON brand_core(tenant_id);
CREATE INDEX idx_personas_tenant ON personas(tenant_id);
CREATE INDEX idx_campaigns_tenant_status ON campaigns(tenant_id, status);
CREATE INDEX idx_content_assets_tenant_type ON content_assets(tenant_id, type);
CREATE INDEX idx_content_assets_tags ON content_assets USING GIN (tags);
CREATE INDEX idx_landing_pages_tenant ON landing_pages(tenant_id);
CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX idx_emails_tenant_channel ON emails(tenant_id, channel);
CREATE INDEX idx_ad_perf_tenant_date ON ad_performance(tenant_id, date);
CREATE INDEX idx_analytics_snapshots_tenant_date ON analytics_snapshots(tenant_id, date);
CREATE INDEX idx_affiliate_events_tenant_time ON affiliate_events(tenant_id, occurred_at);
CREATE INDEX idx_events_tenant_time ON events(tenant_id, occurred_at);
CREATE INDEX idx_events_campaign_time ON events(campaign_id, occurred_at);
CREATE INDEX idx_events_meta_gin ON events USING GIN (meta);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_core ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tenants ON tenants USING (id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_users ON users USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_brand ON brand_core USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_personas ON personas USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_campaigns ON campaigns USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_assets ON content_assets USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_pages ON landing_pages USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_leads ON leads USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_emails ON emails USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_influencer ON influencer_campaigns USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_adperf ON ad_performance USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_snapshots ON analytics_snapshots USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_aff_events ON affiliate_events USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation_events ON events USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

