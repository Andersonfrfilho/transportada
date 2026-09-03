-- ⚠️ As ocorrencias registradas e os tipos cadastrados se perdem: a coluna `type` era texto de um
-- catalogo que nao existe mais, e nao ha de onde reconstitui-la.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903140000_company_occurrence_types';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_occurrence_types journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "company_occurrence_notification_settings" (
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"notifies" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_notification_settings_pkey" PRIMARY KEY ("company_id", "type")
);

DELETE FROM "trip_document_occurrences";

ALTER TABLE "trip_document_occurrences"
	DROP CONSTRAINT "trip_document_occurrences_company_type_fk";

ALTER TABLE "trip_document_occurrences"
	DROP COLUMN "occurrence_type_id";

ALTER TABLE "trip_document_occurrences"
	ADD COLUMN "type" text NOT NULL DEFAULT 'recusa_total';

ALTER TABLE "trip_document_occurrences"
	ADD CONSTRAINT "trip_document_occurrences_type_check"
	CHECK ("type" IN ('item_faltante', 'item_avariado', 'divergencia_quantidade', 'recusa_total', 'recusa_parcial', 'avaria_transporte', 'destinatario_ausente'));

DROP TABLE IF EXISTS "company_occurrence_types";
