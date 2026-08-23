CREATE TABLE "consumer_inbox" (
	"consumer_name" varchar(120),
	"message_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumer_inbox_pk" PRIMARY KEY("consumer_name","message_id")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"notification_id" uuid NOT NULL,
	"channel" varchar(40) NOT NULL,
	"recipient" varchar(320) NOT NULL,
	"status" varchar(40) DEFAULT 'SIMULATED' NOT NULL,
	"provider_message_id" varchar(180),
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_notification_channel_unique" UNIQUE("notification_id","channel"),
	CONSTRAINT "notification_deliveries_channel_check" CHECK (length(btrim("channel")) > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_event_id" uuid NOT NULL UNIQUE,
	"recipient_id" uuid NOT NULL,
	"type" varchar(120) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"data" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_title_check" CHECK (length(btrim("title")) > 0),
	CONSTRAINT "notifications_body_check" CHECK (length(btrim("body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"aggregate_type" varchar(80) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"event_version" smallint DEFAULT 1 NOT NULL,
	"routing_key" varchar(160) NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" varchar(100) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "outbox_events_type_check" CHECK (length(btrim("event_type")) > 0),
	CONSTRAINT "outbox_events_routing_key_check" CHECK (length(btrim("routing_key")) > 0)
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" ("next_attempt_at","occurred_at") WHERE "published_at" is null;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE;