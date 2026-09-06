CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  printer_id UUID REFERENCES printers(id) ON DELETE SET NULL,
  customer_token TEXT UNIQUE NOT NULL,
  copies INT NOT NULL DEFAULT 1 CHECK (copies > 0),
  color_mode TEXT NOT NULL CHECK (color_mode IN ('BW', 'COLOR')),
  paper_size TEXT NOT NULL CHECK (paper_size IN ('A4', 'A3')),
  page_range TEXT,
  duplex BOOLEAN NOT NULL DEFAULT FALSE,
  price NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'CLAIMED', 'PRINTING', 'COMPLETED', 'FAILED', 'FAILED_PERMANENT')),
  claimed_by_agent UUID REFERENCES agents(id) ON DELETE SET NULL,
  claim_expires_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_shop_id ON jobs(shop_id);
CREATE INDEX IF NOT EXISTS idx_jobs_claim_expires_at ON jobs(claim_expires_at);
