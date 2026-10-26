# Evidência — 279

Spec escrita em 26/10/2026 a partir do código de `staging` (2ca71f2). Nada implementado ainda.

## T1 — tabela `delivery_client_emails` (26/10/2026)

- Migration `20261026193116_delivery_client_emails` (aditiva, gerada pelo `db:generate` com snapshot) e `rollback.sql`
  que **recusa** com e-mail guardado. Schema em `src/database/delivery-client-email.schema.ts`; vocabulário único em
  `src/shared/delivery-client-email.constant.ts` (`DELIVERY_CLIENT_EMAIL_PURPOSES`, limite 10 por tipo, padrão e 254 de
  `nfe_documents.recipient_email`, rótulo até 60).
- Colunas: `id, company_id, tax_id, purpose, address, label, created_by_kind ('office'|'driver'), created_by_user_id,
created_at, updated_at`. FK `(company_id, tax_id)` → `delivery_clients` (cascade), único
  `(company_id, tax_id, purpose, lower(address))`, índice `(company_id, tax_id, purpose)`. `created_by` de D1 virou
  `created_by_kind` + `created_by_user_id` (sem FK) porque D7 pede saber se foi o usuário ou o motorista.
- O tipo de D1 é a coluna `purpose`; a API (T2) expõe como `?type=`.
- CA1 no banco: `test/database-migration/delivery-client-emails.assertion.ts` (duplicata sem caixa, mesmo endereço em
  outro tipo, tipo fora do vocabulário, forma e tamanho do endereço, rótulo, autor, cliente de outra empresa pela FK,
  rollback recusado com dado, rollback vazio, reapply). O limite de 10 e a máscara são da API (T2).
- `bun test ./test/database-migration.contract.test.ts` com Postgres 16 descartável: 192 pass / 0 fail (a asserção
  conferida vermelha ao trocar a mensagem esperada). `tsc --noEmit` e `eslint` da API verdes.
