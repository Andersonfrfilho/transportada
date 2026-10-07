-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 246 T1b.1 (RF0, D-c): o momento do tipo de ocorrência vira conjunto, numa tabela filha no
-- padrão de tenant. A CHECK é gerada de `OCCURRENCE_MOMENTS`. O backfill é fiel a todo leitor de
-- hoje, uma regra por instrução, tipos inativos inclusive, `ON CONFLICT DO NOTHING`:
--   `separation` onde `stage = 'separation'` (galpão: separador, WhatsApp do operador);
--   `document`   onde `stage = 'delivery' AND flow = 'document'` (nota: motorista, snapshot);
--   `stop`       onde `stage = 'delivery' AND flow = 'stop'` (parada) **e** onde
--                `stage = 'separation' AND flow = 'stop'` — o registro de parada já aceita esse tipo
--                hoje (lê só `flow`); fechar o furo é spec à parte (D-c);
--   `office`     onde `stage = 'delivery'` (o lote do escritório lê só `stage`).
-- `separation + document` nunca sai daqui (só o operador monta esse conjunto); os dois "Avaria" que
-- existirem continuam dois tipos. `stage` e `flow` ficam gravados: são a rede do rollback.
CREATE TABLE "company_occurrence_type_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_type_id" uuid NOT NULL,
	"moment" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_moments_unique" UNIQUE("company_id","occurrence_type_id","moment"),
	CONSTRAINT "company_occurrence_type_moments_moment_check" CHECK ("moment" in ('separation', 'document', 'stop', 'office'))
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_type_moments" ADD CONSTRAINT "company_occurrence_type_moments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_moments" ADD CONSTRAINT "company_occurrence_type_moments_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'separation' FROM "company_occurrence_types" WHERE "stage" = 'separation' ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING;--> statement-breakpoint
INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'document' FROM "company_occurrence_types" WHERE "stage" = 'delivery' AND "flow" = 'document' ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING;--> statement-breakpoint
INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'stop' FROM "company_occurrence_types" WHERE "stage" = 'delivery' AND "flow" = 'stop' ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING;--> statement-breakpoint
INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'stop' FROM "company_occurrence_types" WHERE "stage" = 'separation' AND "flow" = 'stop' ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING;--> statement-breakpoint
INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'office' FROM "company_occurrence_types" WHERE "stage" = 'delivery' ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING;
