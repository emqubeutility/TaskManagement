CREATE TABLE "plan_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"scope" text NOT NULL,
	"start_date" date NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plan_items_step_id_unique" UNIQUE("step_id")
);
--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_step_id_task_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."task_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_items_user_idx" ON "plan_items" USING btree ("user_id");