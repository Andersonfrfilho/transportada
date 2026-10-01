-- Spec 220 RF17: a miniatura do comprovante de entrega ganha coluna e purpose próprios.
-- Custo de lock a enxergar em produção: o ADD CONSTRAINT ... FOREIGN KEY toma SHARE ROW EXCLUSIVE em
-- `trip_delivery_proofs` E em `stored_objects`, que é compartilhada com NF-e, CT-e, MDF-e e e-mail.
-- A coluna nasce 100% NULL, então a validação varre pouco, mas o lock existe enquanto ela roda.
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "thumbnail_object_id" uuid;--> statement-breakpoint
CREATE INDEX "trip_delivery_proofs_company_thumbnail_idx" ON "trip_delivery_proofs" ("company_id","thumbnail_object_id") WHERE "thumbnail_object_id" is not null;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_thumbnail_fk" FOREIGN KEY ("company_id","thumbnail_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check";--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail', 'extra_charge_batch_statement', 'occurrence_conversation_attachment', 'trip_delivery_proof_thumbnail')) NOT VALID;--> statement-breakpoint
ALTER TABLE "stored_objects" VALIDATE CONSTRAINT "stored_objects_purpose_check";
