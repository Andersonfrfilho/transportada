-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Ícone padrão dos tipos de ocorrência que ainda não têm um (spec 255 deixou todos sem).
-- Só dado, sem mudança de esquema, e só onde `icon_name` é nulo: o ícone que o operador já escolheu
-- na aba Tipos nunca é reescrito. Os de parada saem do `stop_kind` (valor fixo do tipo), então um tipo
-- renomeado pela empresa recebe o mesmo ícone. Os de nota não têm valor fixo: casam pelo nome do
-- catálogo de bootstrap e do cadastro atual, como as migrations de `stop_kind` e `items_mode`; tipo
-- renomeado fica sem ícone até alguém escolher na aba Tipos.
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

UPDATE "company_occurrence_types"
SET "icon_name" = CASE "name"
  WHEN 'Destinatário ausente' THEN 'truck'
  WHEN 'Devolução parcial' THEN 'package'
  WHEN 'Devolução total' THEN 'package'
  WHEN 'Recusa parcial' THEN 'package'
  WHEN 'Recusa total' THEN 'package'
  WHEN 'Avaria no transporte' THEN 'alert'
  WHEN 'Item avariado' THEN 'alert'
  WHEN 'Item faltante' THEN 'clipboard-list'
  WHEN 'Prorrogação do boleto' THEN 'invoice'
  WHEN 'Cliente pediu prorrogação do boleto' THEN 'invoice'
  WHEN 'Cliente pediu segunda via do boleto' THEN 'invoice'
END
WHERE "flow" <> 'stop'
  AND "icon_name" IS NULL
  AND "name" IN (
    'Destinatário ausente', 'Devolução parcial', 'Devolução total', 'Recusa parcial', 'Recusa total',
    'Avaria no transporte', 'Item avariado', 'Item faltante', 'Prorrogação do boleto',
    'Cliente pediu prorrogação do boleto', 'Cliente pediu segunda via do boleto'
  );
