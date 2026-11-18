-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Ícone padrão de "Endereço incorreto" e "Local fechado", que apareciam sem ícone na lista de
-- ocorrências. Esses dois tipos foram criados depois da migration 20261015120000 (por script de
-- ativação, não pelo catálogo de bootstrap), então ficaram com `icon_name` nulo. Só dado, sem mudança
-- de esquema, e só onde `icon_name` é nulo: o ícone que o operador já escolheu nunca é reescrito.
-- Usa só nomes do catálogo fechado que já existe; ícone dedicado (alfinete) pede ampliar o catálogo.
UPDATE "company_occurrence_types"
SET "icon_name" = CASE lower(btrim("name"))
  WHEN 'local fechado' THEN 'alert'
  WHEN 'endereço incorreto' THEN 'clipboard-list'
END
WHERE "icon_name" IS NULL
  AND lower(btrim("name")) IN ('local fechado', 'endereço incorreto');
