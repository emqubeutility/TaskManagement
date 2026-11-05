ALTER TABLE "posts" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Earlier one-to-one messages: a hand-written note that tags exactly one person.
UPDATE "posts" SET "is_private" = true WHERE "kind" = 'note' AND (SELECT count(*) FROM "post_mentions" m WHERE m."post_id" = "posts"."id") = 1;
