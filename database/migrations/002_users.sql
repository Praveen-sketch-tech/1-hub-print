CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'shop_owner' CHECK (role IN ('shop_owner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
