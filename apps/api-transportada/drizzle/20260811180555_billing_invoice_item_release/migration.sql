ALTER TABLE "billing_invoice_items" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
UPDATE "billing_invoice_items" AS "item"
   SET "cancelled_at" = COALESCE("invoice"."cancelled_at", "invoice"."updated_at")
  FROM "billing_invoices" AS "invoice"
 WHERE "invoice"."company_id" = "item"."company_id"
   AND "invoice"."id" = "item"."invoice_id"
   AND "invoice"."status" = 'cancelled'
   AND "item"."cancelled_at" IS NULL;--> statement-breakpoint
ALTER TABLE "billing_invoice_items" DROP CONSTRAINT "billing_invoice_items_company_cte_document_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoice_items_active_cte_document_unique" ON "billing_invoice_items" ("company_id","cte_document_id") WHERE "cancelled_at" is null;
