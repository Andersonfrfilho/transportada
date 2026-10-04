-- Spec 241 (RF1, RF2, RF11): o tipo de ocorrência diz se ela carrega itens. A ORDEM é a decisão:
-- 1. a coluna nasce `optional` em toda linha — o seletor de produtos de hoje, nada muda;
-- 2. a CHECK de vocabulário (`DELIVERY_PROOF_FIELD_MODES`), sem ENUM nativo;
-- 3. a segunda via do boleto semeada pela 208, enquanto ninguém a renomeou, passa a `off` — e, na
--    MESMA instrução, a política de reentrega volta a `unset` (D-E): numa instrução só não há instante
--    com `off` + `allowed`/`blocked`;
-- 4. só então a CHECK da forma, sobre dado já conforme. Antes do passo 3, uma segunda via com
--    política `blocked` derrubaria a migration.
-- Tipo renomeado fica `optional`: o operador desliga no cadastro.
ALTER TABLE "company_occurrence_types" ADD COLUMN "items_mode" varchar(16) DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_items_mode_check" CHECK ("items_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
UPDATE "company_occurrence_types"
SET "items_mode" = 'off', "redelivery_policy" = 'unset'
WHERE "name" = 'Cliente pediu segunda via do boleto'
  AND "stage" = 'delivery'
  AND "flow" = 'document';--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_items_off_shape_check" CHECK ("items_mode" <> 'off' or "redelivery_policy" = 'unset');
