ALTER TABLE "company_occurrence_types" ADD COLUMN "stop_kind" text;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_stop_kind_check" CHECK ("stop_kind" in ('unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'other'));--> statement-breakpoint
-- Spec 218 D2: cada tipo de `flow: stop` guarda qual dos 5 valores fixos ele representa — a sugestão
-- de cobrança (spec 060) e o template do aviso ainda decidem por ele. Três passos, do mais certo ao
-- mais genérico, cada um só onde o anterior não chegou:
-- 1. o `kind` das ocorrências já gravadas com este tipo (o backfill da 20260929131715 as amarrou);
UPDATE "company_occurrence_types" cot
SET "stop_kind" = matched."kind"
FROM (
  SELECT DISTINCT ON ("company_id", "occurrence_type_id") "company_id", "occurrence_type_id", "kind"
  FROM "trip_stop_occurrences"
  WHERE "occurrence_type_id" IS NOT NULL
  ORDER BY "company_id", "occurrence_type_id", "created_at" DESC
) AS matched
WHERE cot."company_id" = matched."company_id"
  AND cot."id" = matched."occurrence_type_id"
  AND cot."flow" = 'stop';--> statement-breakpoint
-- 2. o rótulo com que a 20260929131715 semeou o tipo, enquanto ninguém o renomeou;
UPDATE "company_occurrence_types"
SET "stop_kind" = CASE "name"
  WHEN 'Cobrança inesperada' THEN 'unexpected_charge'
  WHEN 'Espera longa' THEN 'long_wait'
  WHEN 'Doca interditada' THEN 'dock_closed'
  WHEN 'Exigiram agendamento' THEN 'appointment_required'
  WHEN 'Outro' THEN 'other'
END
WHERE "flow" = 'stop'
  AND "stop_kind" IS NULL
  AND "name" IN ('Cobrança inesperada', 'Espera longa', 'Doca interditada', 'Exigiram agendamento', 'Outro');--> statement-breakpoint
-- 3. o resto dos tipos de parada vale como "other" — o mesmo que o cadastro grava num tipo novo.
UPDATE "company_occurrence_types"
SET "stop_kind" = 'other'
WHERE "flow" = 'stop' AND "stop_kind" IS NULL;
