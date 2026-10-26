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

## T2 — API do painel `delivery-clients/:taxId/emails` (26/10/2026)

- Rotas em `src/delivery-clients/presentation/delivery-client-email.routes.ts`: `GET ?type=` (`fleet.read`),
  `POST`, `PATCH /:emailId` (só o rótulo) e `DELETE /:emailId` (`fleet.manage`, D5). Documento fora de forma é `404`
  como em `by-tax-id`; `type` fora do vocabulário é `400`.
- Corpo do `POST`: `{ purpose, address, label? }`. Endereço aparado, até 254, sem espaço nem `,;<>` (D4). Toda resposta
  leva `addressMasked` (`maskEmailAddress`), nunca o endereço; `createdByKind` = `office`.
- Repositório (`drizzle-delivery-client-email.repository.ts`): escrita trava a linha do cliente (`FOR UPDATE`), então
  o limite de 10 por tipo (`422 DELIVERY_CLIENT_EMAIL_LIMIT_REACHED`) e a duplicata sem caixa
  (`409 DELIVERY_CLIENT_EMAIL_ALREADY_EXISTS`, com o id do existente) valem sob concorrência. Cliente de outra empresa:
  `404 DELIVERY_CLIENT_NOT_FOUND`; e-mail que não é dele: `404 DELIVERY_CLIENT_EMAIL_NOT_FOUND`.
- Auditoria (D7) na mesma transação: `delivery-client-email.{created,updated,removed}` em `audit_logs`, com endereço
  **mascarado** nos snapshots e sem o documento do cliente no metadata.
- Testes: `test/delivery-clients-http/emails.contract.ts` (rotas, validação, permissões) e
  `test/integration/delivery-client-emails.integration.ts` (CA1: adicionar, listar mascarado, editar rótulo, remover,
  limite 10 inclusive com 14 inclusões simultâneas, duplicata, outra empresa, auditoria sem endereço em claro), no
  `test:integration` da API. `bun run test` 12550 pass / 0 fail; integração com Postgres 16 descartável 4 pass;
  `tsc --noEmit` e `eslint` verdes.
