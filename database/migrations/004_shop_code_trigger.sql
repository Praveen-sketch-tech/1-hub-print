CREATE OR REPLACE FUNCTION generate_shop_code() RETURNS TRIGGER AS $$
DECLARE
  base_code TEXT;
  candidate TEXT;
  suffix TEXT;
  clash_count INT;
BEGIN
  IF NEW.shop_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  base_code := UPPER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z]', '', 'g'));
  base_code := SUBSTRING(base_code FROM 1 FOR 5);
  IF LENGTH(base_code) = 0 THEN
    base_code := 'SHOP';
  END IF;

  LOOP
    suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    candidate := base_code || suffix;
    SELECT COUNT(*) INTO clash_count FROM shops WHERE shop_code = candidate;
    EXIT WHEN clash_count = 0;
  END LOOP;

  NEW.shop_code := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_shop_code ON shops;
CREATE TRIGGER trg_generate_shop_code
  BEFORE INSERT ON shops
  FOR EACH ROW
  EXECUTE FUNCTION generate_shop_code();
