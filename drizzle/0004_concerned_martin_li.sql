ALTER TABLE "tasks" ADD COLUMN "owner_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;
UPDATE "tasks" SET "owner_ids" = ARRAY["owner_id"] WHERE cardinality("owner_ids") = 0;
