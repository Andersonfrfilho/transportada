-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 317 Etapa 1 (RF1, RF2): a cobrança no recebimento vai para os acertos. Aditivo: enum `receiving_charge`,
-- vínculo da cobrança com a ocorrência de parada, notas da linha agrupada, vagas de foto do tipo, fotos por vaga,
-- valor pago / quem pagou / PIX do motorista, comprovante do PIX e a marca do cliente. Nenhuma coluna existente muda
-- de valor; a única alteração de dado é a semeadura do tipo `unexpected_charge` no fim (mesma empresa, sem criar tipo).
-- A CHECK de valor da cobrança aceita `0` para `receiving_charge` (spec 247: `0` é valor declarado).
CREATE TABLE "delivery_charge_documents" (
	"company_id" uuid,
	"charge_id" uuid,
	"trip_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_charge_documents_pk" PRIMARY KEY("company_id","charge_id","trip_document_id")
);
--> statement-breakpoint
CREATE TABLE "company_occurrence_type_photo_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_type_id" uuid NOT NULL,
	"slot_key" varchar(48) NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_photo_slots_key_unique" UNIQUE("company_id","occurrence_type_id","slot_key"),
	CONSTRAINT "company_occurrence_type_photo_slots_key_check" CHECK ("slot_key" ~ '^[a-z][a-z0-9_]{0,47}$'),
	CONSTRAINT "company_occurrence_type_photo_slots_label_check" CHECK (length(btrim("label")) > 0),
	CONSTRAINT "company_occurrence_type_photo_slots_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trip_stop_occurrence_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"stop_occurrence_id" uuid NOT NULL,
	"slot_key" varchar(48) NOT NULL,
	"object_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stop_occurrence_photos_slot_unique" UNIQUE("company_id","stop_occurrence_id","slot_key"),
	CONSTRAINT "trip_stop_occurrence_photos_key_check" CHECK ("slot_key" ~ '^[a-z][a-z0-9_]{0,47}$'),
	CONSTRAINT "trip_stop_occurrence_photos_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD COLUMN "stop_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD COLUMN "grouped_documents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_clients" ADD COLUMN "receiving_charge_flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_clients" ADD COLUMN "receiving_charge_source_stop_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "show_client_charge_seal_to_driver" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "declared_amount" numeric(14,4);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "paid_by" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "driver_pix_key" text;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "driver_pix_key_type" text;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "driver_payout_receipt_object_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "driver_payout_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "driver_payout_sent_by_user_id" uuid;--> statement-breakpoint
CREATE INDEX "delivery_charge_documents_document_idx" ON "delivery_charge_documents" ("company_id","trip_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_charges_stop_occurrence_document_unique" ON "delivery_charges" ("company_id","stop_occurrence_id","trip_document_id") WHERE "stop_occurrence_id" is not null and "trip_document_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_charges_stop_occurrence_grouped_unique" ON "delivery_charges" ("company_id","stop_occurrence_id") WHERE "stop_occurrence_id" is not null and "grouped_documents";--> statement-breakpoint
CREATE INDEX "trip_stop_occurrence_photos_object_idx" ON "trip_stop_occurrence_photos" ("company_id","object_id");--> statement-breakpoint
ALTER TABLE "delivery_charge_documents" ADD CONSTRAINT "delivery_charge_documents_company_charge_fk" FOREIGN KEY ("company_id","charge_id") REFERENCES "delivery_charges"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charge_documents" ADD CONSTRAINT "delivery_charge_documents_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_company_stop_occurrence_fk" FOREIGN KEY ("company_id","stop_occurrence_id") REFERENCES "trip_stop_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_company_proof_object_fk" FOREIGN KEY ("company_id","proof_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_clients" ADD CONSTRAINT "delivery_clients_receiving_charge_source_fk" FOREIGN KEY ("company_id","receiving_charge_source_stop_occurrence_id") REFERENCES "trip_stop_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_photo_slots" ADD CONSTRAINT "company_occurrence_type_photo_slots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_photo_slots" ADD CONSTRAINT "company_occurrence_type_photo_slots_company_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrence_photos" ADD CONSTRAINT "trip_stop_occurrence_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrence_photos" ADD CONSTRAINT "trip_stop_occurrence_photos_company_occurrence_fk" FOREIGN KEY ("company_id","stop_occurrence_id") REFERENCES "trip_stop_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrence_photos" ADD CONSTRAINT "trip_stop_occurrence_photos_company_object_fk" FOREIGN KEY ("company_id","object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_payout_receipt_object_fk" FOREIGN KEY ("company_id","driver_payout_receipt_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_payout_sender_membership_fk" FOREIGN KEY ("driver_payout_sent_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_receiving_charge_check" CHECK ("charge_type" <> 'receiving_charge' or ("origin" = 'occurrence' and "stop_occurrence_id" is not null and ("trip_document_id" is not null or "grouped_documents")));--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_stop_occurrence_type_check" CHECK ("stop_occurrence_id" is null or "charge_type" = 'receiving_charge');--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_grouped_documents_check" CHECK (not "grouped_documents" or ("charge_type" = 'receiving_charge' and "trip_document_id" is null));--> statement-breakpoint
ALTER TABLE "delivery_clients" ADD CONSTRAINT "delivery_clients_receiving_charge_mark_check" CHECK ("receiving_charge_source_stop_occurrence_id" is null or "receiving_charge_flagged_at" is not null);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_declared_amount_check" CHECK ("declared_amount" is null or "declared_amount" >= 0);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_paid_by_check" CHECK ("paid_by" is null or "paid_by" in ('driver', 'company'));--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_driver_pix_check" CHECK (("paid_by" is distinct from 'driver' or ("driver_pix_key" is not null and length(btrim("driver_pix_key")) > 0 and "driver_pix_key_type" is not null)) and ("driver_pix_key_type" is null or "driver_pix_key_type" in ('cpf', 'cnpj', 'email', 'phone', 'random')) and ("driver_pix_key" is null or length("driver_pix_key") <= 140));--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_driver_payout_check" CHECK ("driver_payout_receipt_object_id" is null or ("driver_payout_sent_at" is not null and "driver_payout_sent_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_type_check", ADD CONSTRAINT "delivery_charges_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other', 'returned_goods', 'receiving_charge'));--> statement-breakpoint
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_amount_check", ADD CONSTRAINT "delivery_charges_amount_check" CHECK ("amount" > 0 or "status" = 'suggested' or "charge_type" = 'receiving_charge');--> statement-breakpoint
ALTER TABLE "delivery_client_charge_rules" DROP CONSTRAINT "delivery_client_charge_rules_type_check", ADD CONSTRAINT "delivery_client_charge_rules_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other', 'returned_goods', 'receiving_charge'));--> statement-breakpoint
-- Spec 317 RF2: semeadura por empresa no tipo de parada `unexpected_charge`. Idempotente (ON CONFLICT / WHERE):
-- 1. valor pago obrigatório, escopo da ocorrência (a CHECK do escopo exige `occurrence` com `items_mode = 'off'`);
-- 2. nada sai à contratante (D1): e-mail desligado, sem modelo, sem resposta da contratante e sem encaminhamento
--    automático (a CHECK exige resposta para o automático);
-- 3. renomeia só onde o nome ainda é o padrão semeado (E9);
-- 4. as duas vagas de foto, ambas obrigatórias (E1).
UPDATE "company_occurrence_types"
SET "declared_amount_mode" = 'required',
    "declared_amount_scope" = 'occurrence',
    "emails_contractor" = false,
    "contractor_notification_template_key" = NULL,
    "contractor_notification_template_selected_at" = NULL,
    "contractor_reply_mode" = 'off',
    "forward_to_note_recipient" = CASE WHEN "forward_to_note_recipient" = 'automatic' THEN 'manual' ELSE "forward_to_note_recipient" END
WHERE "flow" = 'stop' AND "stop_kind" = 'unexpected_charge';--> statement-breakpoint
UPDATE "company_occurrence_types"
SET "name" = 'Cobrança no recebimento'
WHERE "flow" = 'stop' AND "stop_kind" = 'unexpected_charge' AND "name" = 'Cobrança inesperada';--> statement-breakpoint
INSERT INTO "company_occurrence_type_photo_slots" ("company_id", "occurrence_type_id", "slot_key", "label", "required", "position")
SELECT "company_id", "id", slot."slot_key", slot."label", true, slot."position"
FROM "company_occurrence_types"
CROSS JOIN (VALUES
  ('charge_sign', 'Foto da placa de cobrança', 0),
  ('payment_receipt', 'Foto do comprovante de pagamento', 1)
) AS slot("slot_key", "label", "position")
WHERE "flow" = 'stop' AND "stop_kind" = 'unexpected_charge'
ON CONFLICT ("company_id", "occurrence_type_id", "slot_key") DO NOTHING;
