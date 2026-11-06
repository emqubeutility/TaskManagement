ALTER TABLE "plan_items" DROP CONSTRAINT "plan_items_step_id_unique";--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_step_day_unique" UNIQUE("step_id","start_date");