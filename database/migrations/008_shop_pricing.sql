CREATE TABLE IF NOT EXISTS shop_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  paper_size TEXT NOT NULL CHECK (paper_size IN ('A4', 'A3')),
  color_mode TEXT NOT NULL CHECK (color_mode IN ('BW', 'COLOR')),
  duplex BOOLEAN NOT NULL DEFAULT FALSE,
  price_per_page NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, paper_size, color_mode, duplex)
);
