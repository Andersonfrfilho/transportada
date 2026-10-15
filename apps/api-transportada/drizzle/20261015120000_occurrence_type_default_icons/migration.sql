-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Ícone padrão dos tipos de ocorrência de parada que ainda não têm um (spec 255 deixou todos sem).
-- Só dado, sem mudança de esquema, e só onde `icon_name` é nulo: o ícone que o operador já escolheu
-- na aba Tipos nunca é reescrito. A escolha vem do `stop_kind` (valor fixo do tipo), não do nome,
-- então um tipo renomeado pela empresa recebe o mesmo ícone.
UPDATE "company_occurrence_types"
SET "icon_name" = CASE "stop_kind"
  WHEN 'unexpected_charge' THEN 'money'
  WHEN 'long_wait' THEN 'clock'
  WHEN 'dock_closed' THEN 'alert'
  WHEN 'appointment_required' THEN 'clipboard-list'
  WHEN 'other' THEN 'message'
END
WHERE "flow" = 'stop'
  AND "icon_name" IS NULL
  AND "stop_kind" IN ('unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'other');
