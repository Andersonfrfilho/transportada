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
