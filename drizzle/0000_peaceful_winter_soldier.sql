CREATE TYPE "public"."action_kind" AS ENUM('CA_EMAIL', 'GSTR3B_FLAG', 'TALLY_ENTRY');--> statement-breakpoint
CREATE TYPE "public"."exception_category" AS ENUM('FEE_DEDUCTION', 'TIMING', 'REFUND_NETTED', 'PARTIAL_PAYMENT', 'UNEXPLAINED');--> statement-breakpoint
CREATE TYPE "public"."match_method" AS ENUM('EXACT', 'FUZZY', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('MATCHED', 'EXCEPTION');--> statement-breakpoint
CREATE TYPE "public"."rate_cell" AS ENUM('STANDARD', 'CORPORATE');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"kind" "action_kind" NOT NULL,
	"draft" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_gstin" text NOT NULL,
	"period" text NOT NULL,
	"total_records" integer NOT NULL,
	"matched_exact" integer DEFAULT 0 NOT NULL,
	"matched_fuzzy" integer DEFAULT 0 NOT NULL,
	"exceptions" integer DEFAULT 0 NOT NULL,
	"itc_claimable_paise" integer DEFAULT 0 NOT NULL,
	"itc_at_risk_paise" integer DEFAULT 0 NOT NULL,
	"gstr2b_invoice_txval_paise" integer,
	"gstr2b_invoice_tax_paise" integer,
	"rolled_up_tax_paise" integer,
	"rollup_delta_paise" integer,
	"gstr2b_itc_available" boolean,
	"gstr2b_itc_reason" text,
	"processing_time_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"record_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"period" text NOT NULL,
	"razorpay_fee_paise" integer NOT NULL,
	"razorpay_tax_paise" integer NOT NULL,
	"rate_cell" "rate_cell",
	"expected_fee_paise" integer,
	"expected_tax_paise" integer,
	"status" "match_status" NOT NULL,
	"match_method" "match_method" NOT NULL,
	"exception_category" "exception_category",
	"credit_note_review" boolean DEFAULT false NOT NULL,
	"reason" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;