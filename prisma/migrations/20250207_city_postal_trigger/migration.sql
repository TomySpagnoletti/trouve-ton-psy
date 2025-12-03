-- Keep CityPostal in sync with City.postal_codes automatically

-- Clean up in case of reruns in dev
DROP TRIGGER IF EXISTS "city_postal_sync" ON "City";
DROP FUNCTION IF EXISTS sync_city_postal;

CREATE OR REPLACE FUNCTION sync_city_postal()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op if the array did not change on update
  IF TG_OP = 'UPDATE' AND NEW.postal_codes IS NOT DISTINCT FROM OLD.postal_codes THEN
    RETURN NEW;
  END IF;

  IF NEW.postal_codes IS NULL THEN
    RETURN NEW;
  END IF;

  -- Upsert new/changed codes
  INSERT INTO "CityPostal" (city_id, postal_code)
  SELECT NEW.id, code
  FROM unnest(NEW.postal_codes) AS code
  ON CONFLICT DO NOTHING;

  -- Remove codes no longer present
  DELETE FROM "CityPostal" AS cp
  WHERE cp.city_id = NEW.id
    AND NOT (cp.postal_code = ANY (NEW.postal_codes));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER city_postal_sync
AFTER INSERT OR UPDATE OF postal_codes ON "City"
FOR EACH ROW
WHEN (NEW.postal_codes IS NOT NULL)
EXECUTE FUNCTION sync_city_postal();

-- One-time resync to align existing data
INSERT INTO "CityPostal" (city_id, postal_code)
SELECT c.id, code
FROM "City" AS c, unnest(c.postal_codes) AS code
ON CONFLICT DO NOTHING;

DELETE FROM "CityPostal" AS cp
WHERE NOT EXISTS (
  SELECT 1
  FROM "City" AS c
  WHERE c.id = cp.city_id
    AND cp.postal_code = ANY (c.postal_codes)
);
