CREATE TABLE "cte_issuance_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_subtype" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "batch_item_id" uuid NOT NULL,
  "attempt_id" uuid NOT NULL,
  "attempt_kind" text NOT NULL,
  "status" text NOT NULL,
  "event_type" text NOT NULL,
  "event_version" bigint NOT NULL,
  "attempt_fingerprint" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "correlation_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "claim_owner" text,
  "claim_expires_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cte_issuance_outbox_company_id_id_unique" UNIQUE("company_id","id"),
  CONSTRAINT "cte_issuance_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
  CONSTRAINT "cte_issuance_outbox_attempt_kind_check" CHECK ("attempt_kind" in ('issue', 'reprocess')),
  CONSTRAINT "cte_issuance_outbox_status_check" CHECK ("status" in ('requested', 'retry_scheduled')),
  CONSTRAINT "cte_issuance_outbox_event_type_check" CHECK ("event_type" in ('transportada.cte.item.issue.requested')),
  CONSTRAINT "cte_issuance_outbox_event_version_check" CHECK ("event_version" > 0),
  CONSTRAINT "cte_issuance_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null))
);
--> statement-breakpoint
CREATE INDEX "cte_issuance_outbox_company_published_next_attempt_created_idx"
  ON "cte_issuance_outbox" ("company_id","published_at","next_attempt_at","created_at");
--> statement-breakpoint
ALTER TABLE "cte_issuance_outbox"
  ADD CONSTRAINT "cte_issuance_outbox_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "cte_issuance_outbox"
  ADD CONSTRAINT "cte_issuance_outbox_company_aggregate_fk"
  FOREIGN KEY ("company_id","aggregate_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "cte_issuance_outbox"
  ADD CONSTRAINT "cte_issuance_outbox_company_batch_fk"
  FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "cte_issuance_outbox"
  ADD CONSTRAINT "cte_issuance_outbox_company_batch_item_fk"
  FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "cte_issuance_outbox"
  ADD CONSTRAINT "cte_issuance_outbox_company_attempt_fk"
  FOREIGN KEY ("company_id","attempt_id") REFERENCES "cte_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "cte_issuance_outbox"
  ADD CONSTRAINT "cte_issuance_outbox_actor_membership_fk"
  FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
