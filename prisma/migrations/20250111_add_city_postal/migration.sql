-- CreateTable
CREATE TABLE "city_postal" (
    "city_id" INTEGER NOT NULL,
    "postal_code" TEXT NOT NULL,

    CONSTRAINT "city_postal_pkey" PRIMARY KEY ("city_id","postal_code")
);

-- CreateIndex
CREATE INDEX "idx_city_postal_prefix" ON "city_postal" ("postal_code" text_pattern_ops);

-- AddForeignKey
ALTER TABLE "city_postal" ADD CONSTRAINT "city_postal_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Psychologist_coordinates_idx" RENAME TO "Psychologist_coordinates_x_coordinates_y_idx";

-- Backfill from existing array column
INSERT INTO "city_postal" ("city_id", "postal_code")
SELECT c.id, unnest(c.postal_codes)
FROM "City" AS c
ON CONFLICT DO NOTHING;
