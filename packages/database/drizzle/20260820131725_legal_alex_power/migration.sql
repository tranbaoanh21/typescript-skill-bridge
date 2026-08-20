CREATE TYPE "sprint_status" AS ENUM('PLANNED', 'ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "task_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "task_status" AS ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" uuid,
	"action" varchar(120) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" uuid,
	"request_id" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"goal" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "sprint_status" DEFAULT 'PLANNED'::"sprint_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprints_identity_unique" UNIQUE("id","project_id"),
	CONSTRAINT "sprints_name_not_blank_check" CHECK (length(btrim("name")) > 0),
	CONSTRAINT "sprints_dates_check" CHECK ("starts_on" <= "ends_on"),
	CONSTRAINT "sprints_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"task_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(80) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignees_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"sprint_id" uuid,
	"created_by" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'TODO'::"task_status" NOT NULL,
	"priority" "task_priority" DEFAULT 'MEDIUM'::"task_priority" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_identity_unique" UNIQUE("id","project_id"),
	CONSTRAINT "tasks_title_not_blank_check" CHECK (length(btrim("title")) > 0),
	CONSTRAINT "tasks_position_check" CHECK ("position" >= 0),
	CONSTRAINT "tasks_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "sprints_project_status_idx" ON "sprints" ("project_id","status");--> statement-breakpoint
CREATE INDEX "task_activities_task_created_idx" ON "task_activities" ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_assignees_user_idx" ON "task_assignees" ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_project_board_idx" ON "tasks" ("project_id","status","position");--> statement-breakpoint
CREATE INDEX "tasks_sprint_idx" ON "tasks" ("sprint_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_identity_fk" FOREIGN KEY ("task_id","project_id") REFERENCES "tasks"("id","project_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_member_identity_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "project_members"("project_id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_project_fk" FOREIGN KEY ("sprint_id","project_id") REFERENCES "sprints"("id","project_id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE TRIGGER sprints_set_updated_at
BEFORE UPDATE ON sprints
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'audit_logs_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
