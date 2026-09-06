CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Print Agent',
  token_hash TEXT UNIQUE,
  pairing_code VARCHAR(10) UNIQUE,
  pairing_code_expires_at TIMESTAMPTZ,
  paired_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_shop_id ON agents(shop_id);
