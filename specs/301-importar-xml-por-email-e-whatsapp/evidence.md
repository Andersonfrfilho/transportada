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
