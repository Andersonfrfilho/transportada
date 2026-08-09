ALTER TABLE "cte_issuance_payloads" ADD COLUMN "taker_tax_id" text;--> statement-breakpoint
ALTER TABLE "cte_issuance_payloads" ADD COLUMN "taker_legal_name" text;--> statement-breakpoint
UPDATE "cte_issuance_payloads"
SET
  "taker_tax_id" = coalesce(
    (
      CASE "payload" ->> 'tomador'
        WHEN '0' THEN "payload" -> 'remetente'
        WHEN '3' THEN "payload" -> 'destinatario'
      END
    ) ->> 'cnpj',
    (
      CASE "payload" ->> 'tomador'
        WHEN '0' THEN "payload" -> 'remetente'
        WHEN '3' THEN "payload" -> 'destinatario'
      END
    ) ->> 'cpf'
  ),
  "taker_legal_name" = (
    CASE "payload" ->> 'tomador'
      WHEN '0' THEN "payload" -> 'remetente'
      WHEN '3' THEN "payload" -> 'destinatario'
    END
  ) ->> 'xNome'
WHERE "taker_tax_id" IS NULL AND "payload" ->> 'tomador' IN ('0', '3');
