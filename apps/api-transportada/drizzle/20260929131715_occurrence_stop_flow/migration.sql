ALTER TABLE "company_occurrence_types" ADD COLUMN "flow" text DEFAULT 'document' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_flow_check" CHECK ("flow" in ('document', 'stop'));--> statement-breakpoint
-- Spec 218 RF-B5: os 5 valores fixos de TRIP_STOP_OCCURRENCE_KINDS viram tipo de verdade no
-- catálogo, uma vez por empresa, com o rótulo literal que o app do motorista já mostra hoje em
-- DRIVER_OCCURRENCE_KINDS (driverTrip.locale.json) — nunca um nome novo que o motorista não
-- reconheça. `flow: 'stop'`, `attachment_mode: 'optional'` (mesmo comportamento de hoje: foto
-- sempre oferecida, nunca obrigatória, até o operador mudar pela tela). `redelivery_policy: unset`,
-- `leaves_document_behind: false`, `emails_contractor: false` são os padrões de sempre — tipo de
-- `flow: stop` nunca abre tratativa nem manda e-mail (decisão explícita da spec, fora de escopo
-- mudar). `INSERT ... SELECT` cruzando `companies` com os 5 valores fixos, não um laço de aplicação.
INSERT INTO "company_occurrence_types" ("company_id", "name", "stage", "flow", "attachment_mode")
SELECT c."id", v."name", 'delivery', 'stop', 'optional'
FROM "companies" c
CROSS JOIN (VALUES
  ('unexpected_charge', 'Cobrança inesperada'),
  ('long_wait', 'Espera longa'),
  ('dock_closed', 'Doca interditada'),
  ('appointment_required', 'Exigiram agendamento'),
  ('other', 'Outro')
) AS v("kind", "name");--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "occurrence_type_id" uuid;--> statement-breakpoint
-- Backfill por (company_id, kind) -> o tipo novo da mesma empresa e do mesmo kind, pelo rótulo que
-- acabou de ser inserido acima (flow = 'stop' restringe a busca aos 5 tipos desta migration, nunca
-- a um tipo homônimo que a empresa já tivesse cadastrado antes com flow = 'document'). `kind`
-- permanece na tabela — nunca apagado, é registro histórico.
UPDATE "trip_stop_occurrences" tso
SET "occurrence_type_id" = cot."id"
FROM "company_occurrence_types" cot
WHERE cot."company_id" = tso."company_id"
  AND cot."flow" = 'stop'
  AND cot."name" = CASE tso."kind"
    WHEN 'unexpected_charge' THEN 'Cobrança inesperada'
    WHEN 'long_wait' THEN 'Espera longa'
    WHEN 'dock_closed' THEN 'Doca interditada'
    WHEN 'appointment_required' THEN 'Exigiram agendamento'
    WHEN 'other' THEN 'Outro'
  END;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_occurrence_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
