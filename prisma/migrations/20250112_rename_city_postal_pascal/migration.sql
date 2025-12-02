-- Rename table to PascalCase to align with Prisma model naming
ALTER TABLE "city_postal" RENAME TO "CityPostal";

-- Rename constraints to match Prisma defaults
ALTER TABLE "CityPostal" RENAME CONSTRAINT "city_postal_pkey" TO "CityPostal_pkey";
ALTER TABLE "CityPostal" RENAME CONSTRAINT "city_postal_city_id_fkey" TO "CityPostal_city_id_fkey";

-- Rename index and keep the text_pattern_ops opclass
ALTER INDEX "idx_city_postal_prefix" RENAME TO "CityPostal_postal_code_idx";
