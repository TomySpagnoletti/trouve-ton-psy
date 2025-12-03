-- Fix search_path on sync_city_postal to avoid Supabase warning about mutable search_path

-- Drop and recreate trigger/function so the function runs with a fixed search_path
DROP TRIGGER IF EXISTS "city_postal_sync" ON "City";
DROP FUNCTION IF EXISTS sync_city_postal;
DROP FUNCTION IF EXISTS public.sync_city_postal;

CREATE OR REPLACE FUNCTION public.sync_city_postal()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
  -- No-op if the array did not change on update
  IF TG_OP = 'UPDATE' AND NEW.postal_codes IS NOT DISTINCT FROM OLD.postal_codes THEN
    RETURN NEW;
  END IF;

  IF NEW.postal_codes IS NULL THEN
    RETURN NEW;
  END IF;

  -- Upsert new/changed codes
  INSERT INTO public."CityPostal" (city_id, postal_code)
  SELECT NEW.id, code
  FROM unnest(NEW.postal_codes) AS code
  ON CONFLICT DO NOTHING;

  -- Remove codes no longer present
  DELETE FROM public."CityPostal" AS cp
  WHERE cp.city_id = NEW.id
    AND NOT (cp.postal_code = ANY (NEW.postal_codes));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER city_postal_sync
AFTER INSERT OR UPDATE OF postal_codes ON "City"
FOR EACH ROW
WHEN (NEW.postal_codes IS NOT NULL)
EXECUTE FUNCTION public.sync_city_postal();
