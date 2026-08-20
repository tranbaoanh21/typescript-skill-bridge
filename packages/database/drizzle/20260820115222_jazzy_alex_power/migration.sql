CREATE TYPE "application_status" AS ENUM('PENDING', 'WITHDRAWN', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "global_role" AS ENUM('STUDENT', 'MENTOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "portfolio_link_kind" AS ENUM('GITHUB', 'LINKEDIN', 'WEBSITE', 'DEMO', 'OTHER');--> statement-breakpoint
CREATE TYPE "project_role" AS ENUM('OWNER', 'LEADER', 'MEMBER');--> statement-breakpoint
CREATE TYPE "project_status" AS ENUM('DRAFT', 'RECRUITING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "portfolio_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"kind" "portfolio_link_kind" DEFAULT 'OTHER'::"portfolio_link_kind" NOT NULL,
	"label" varchar(80) NOT NULL,
	"url" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_links_user_url_unique" UNIQUE("user_id","url"),
	CONSTRAINT "portfolio_links_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY,
	"display_name" varchar(120) NOT NULL,
	"bio" text,
	"university" varchar(160) DEFAULT 'HCMUT' NOT NULL,
	"major" varchar(160),
	"graduation_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_not_blank_check" CHECK (length(btrim("display_name")) > 0),
	CONSTRAINT "profiles_graduation_year_check" CHECK ("graduation_year" is null or "graduation_year" between 2000 and 2200)
);
--> statement-breakpoint
CREATE TABLE "project_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"cover_letter" text NOT NULL,
	"status" "application_status" DEFAULT 'PENDING'::"application_status" NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_applications_identity_unique" UNIQUE("id","project_id","applicant_id"),
	CONSTRAINT "project_applications_cover_letter_not_blank_check" CHECK (length(btrim("cover_letter")) > 0),
	CONSTRAINT "project_applications_decision_check" CHECK ((
        "status" = 'PENDING'
        and "decided_at" is null
        and "decided_by" is null
      ) or (
        "status" = 'WITHDRAWN'
        and "decided_at" is not null
        and "decided_by" is null
      ) or (
        "status" in ('ACCEPTED', 'REJECTED')
        and "decided_at" is not null
        and "decided_by" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid,
	"user_id" uuid,
	"project_role" "project_role" DEFAULT 'MEMBER'::"project_role" NOT NULL,
	"source_application_id" uuid CONSTRAINT "project_members_source_application_unique" UNIQUE,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_owner_source_check" CHECK ("project_role" <> 'OWNER' or "source_application_id" is null)
);
--> statement-breakpoint
CREATE TABLE "project_required_skills" (
	"project_id" uuid,
	"skill_id" uuid,
	"desired_level" smallint NOT NULL,
	"positions" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "project_required_skills_pk" PRIMARY KEY("project_id","skill_id"),
	CONSTRAINT "project_required_skills_desired_level_check" CHECK ("desired_level" between 1 and 5),
	CONSTRAINT "project_required_skills_positions_check" CHECK ("positions" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL UNIQUE,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"status" "project_status" DEFAULT 'DRAFT'::"project_status" NOT NULL,
	"capacity" smallint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "projects_title_not_blank_check" CHECK (length(btrim("title")) > 0),
	CONSTRAINT "projects_description_not_blank_check" CHECK (length(btrim("description")) > 0),
	CONSTRAINT "projects_capacity_check" CHECK ("capacity" > 0),
	CONSTRAINT "projects_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_session_id" uuid,
	"user_agent" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_sessions_rotation_check" CHECK ("replaced_by_session_id" is null or "revoked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(80) NOT NULL UNIQUE,
	"name" varchar(100) NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "skills_name_not_blank_check" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"user_id" uuid,
	"skill_id" uuid,
	"level" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skills_pk" PRIMARY KEY("user_id","skill_id"),
	CONSTRAINT "user_skills_level_check" CHECK ("level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(320) NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"global_role" "global_role" DEFAULT 'STUDENT'::"global_role" NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE'::"user_status" NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower(btrim("email")) and length("email") > 3)
);
--> statement-breakpoint
CREATE INDEX "portfolio_links_user_position_idx" ON "portfolio_links" ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "project_applications_one_pending_idx" ON "project_applications" ("project_id","applicant_id") WHERE "status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "project_applications_project_status_idx" ON "project_applications" ("project_id","status");--> statement-breakpoint
CREATE INDEX "project_applications_applicant_idx" ON "project_applications" ("applicant_id","created_at");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" ("user_id");--> statement-breakpoint
CREATE INDEX "project_required_skills_skill_idx" ON "project_required_skills" ("skill_id");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_discovery_idx" ON "projects" ("status","created_at");--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_family_idx" ON "refresh_sessions" ("user_id","family_id");--> statement-breakpoint
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX "user_skills_skill_level_idx" ON "user_skills" ("skill_id","level");--> statement-breakpoint
ALTER TABLE "portfolio_links" ADD CONSTRAINT "portfolio_links_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_applications" ADD CONSTRAINT "project_applications_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_applications" ADD CONSTRAINT "project_applications_applicant_id_users_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "project_applications" ADD CONSTRAINT "project_applications_decided_by_users_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_application_identity_fk" FOREIGN KEY ("source_application_id","project_id","user_id") REFERENCES "project_applications"("id","project_id","applicant_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "project_required_skills" ADD CONSTRAINT "project_required_skills_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_required_skills" ADD CONSTRAINT "project_required_skills_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_qTD3atkuN4Rx_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_skills_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE;