# Evidência — 301

## T0.1 — Conferência no código

`plan.md` (achados 1–7, arquivo:símbolo).

## T1.1 — Migration `received_via` / `received_from`

- `drizzle/20261108144212_nfe_import_received_via/` (migration, rollback com `ROW_COUNT`, snapshot gerado por `db:generate`).
- Aditiva: `received_via` com default `screen` (importações antigas ficam `screen`), `received_from` anulável; CHECKs de domínio e de coerência
  (`screen` ⇒ sem remetente; outro canal ⇒ remetente de 3 a 254 caracteres).
- `bun test ./test/migration-chain.contract.test.ts ./test/nfe-schema.contract.test.ts ./test/database-migration.contract.test.ts`
  → 230 pass / 0 fail (inclui "o último snapshot bate com o schema TypeScript").
- Pendente: `make migration-test` (migration + rollback em Postgres descartável) — roda na CI; o container desta sessão não tem Docker.
- `bun run typecheck` estoura memória neste container (OOM do Node); o typecheck fica por conta da CI.

## T1.2 (parte 1) — O canal atravessa o caso de uso

- `RequestNfeImportInput.received` (`{ via: 'email' | 'whatsapp', from }`) vai ao rascunho da importação (`receivedVia`/`receivedFrom`);
  ausente = tela, e o rascunho não leva as chaves (vale o default `screen` da coluna). `source` continua `upload`.
- `mapSummary` devolve `receivedVia`/`receivedFrom` ao resumo.
- Contratos novos em `request-and-idempotency.contract.ts` (canal e remetente gravados; tela sem as chaves).
- `tsc --noEmit` limpo (com `NODE_OPTIONS=--max-old-space-size=5000`), eslint limpo, `nfe-import-application` 16 pass / 0 fail.
- Falta da T1.2: o serviço que guarda os anexos e chama o caso de uso para e-mail/WhatsApp (nasce junto da T2.1/T3.1, que são os consumidores).

## T1.2–T4.1 — Entrega completa (08/11/2026)

- Worker: `test/nfe-xml-receipts.contract.test.ts` 47 pass / 0 fail (domínio, intake de e-mail, ciclo WhatsApp, respostas, infra, fatiamento de zip).
- Worker, Postgres 16 real: `test/integration/nfe-xml-receipts.integration.ts` 10 pass / 0 fail (gravação idempotente, claim concorrente
  com skip locked, retomada de recibo preso, remetente de e-mail autorizado, transação de importação completa, reentrega, resumo, alerta).
- API, Postgres 16 real: `test/integration/nfe-xml-receipts.integration.ts` 2 pass / 0 fail (remetente verificado/validade 90 dias/vínculo
  ativo/papel/outra empresa; recibo pendente idempotente e `rejected` só com motivo).
- Migration `20261108151552_nfe_xml_receipts`: aplicada, `rollback.sql` recusa tabela com linhas e derruba vazia, reaplicada.
- Painel: 627 pass (contrato do painel de recibos e origem na fila de importações).
- Conhecido, fora do escopo: 5 falhas do decodificador de código de barras do canhoto no worker (`threaded canhoto barcode decoder`).
