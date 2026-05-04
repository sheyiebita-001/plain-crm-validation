CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid,
	"event_type" text NOT NULL,
	"sequence_step" integer,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"company_size" text,
	"job_title" text,
	"source" text NOT NULL,
	"source_url" text,
	"source_snippet" text,
	"paraphrased_complaint" text,
	"smartlead_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid,
	"reply_text" text NOT NULL,
	"classification" text,
	"classified_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"notes" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"current_crm" text,
	"biggest_frustration" text,
	"top_features" jsonb,
	"willing_to_pay_onetime" text,
	"willing_to_pay_monthly" text,
	"would_preorder" boolean DEFAULT false NOT NULL,
	"wants_call" boolean DEFAULT false NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"ip_address" text,
	"user_agent" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_events_prospect" ON "events" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "idx_events_type_time" ON "events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_prospects_status" ON "prospects" USING btree ("status");--> statement-breakpoint
ALTER TABLE "prospects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "survey_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppression_list" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "admin_only_prospects" ON "prospects" FOR ALL USING (auth.jwt()->>'email' = 'sheyi@trysignalbench.com') WITH CHECK (auth.jwt()->>'email' = 'sheyi@trysignalbench.com');--> statement-breakpoint
CREATE POLICY "admin_only_events" ON "events" FOR ALL USING (auth.jwt()->>'email' = 'sheyi@trysignalbench.com') WITH CHECK (auth.jwt()->>'email' = 'sheyi@trysignalbench.com');--> statement-breakpoint
CREATE POLICY "admin_only_replies" ON "replies" FOR ALL USING (auth.jwt()->>'email' = 'sheyi@trysignalbench.com') WITH CHECK (auth.jwt()->>'email' = 'sheyi@trysignalbench.com');--> statement-breakpoint
CREATE POLICY "admin_only_survey_responses" ON "survey_responses" FOR ALL USING (auth.jwt()->>'email' = 'sheyi@trysignalbench.com') WITH CHECK (auth.jwt()->>'email' = 'sheyi@trysignalbench.com');--> statement-breakpoint
CREATE POLICY "admin_only_suppression_list" ON "suppression_list" FOR ALL USING (auth.jwt()->>'email' = 'sheyi@trysignalbench.com') WITH CHECK (auth.jwt()->>'email' = 'sheyi@trysignalbench.com');