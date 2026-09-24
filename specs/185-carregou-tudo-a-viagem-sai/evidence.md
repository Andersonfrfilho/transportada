# Evidence — Feature 185

Registro por task: comando, saída relevante, commit.

## T1.1 — teste de `resolveDispatchReadiness`

Comando: `bun --env-file=../../.env.test test --timeout 120000 test/trips.contract.test.ts`
(de `apps/api-transportada`, antes da implementação).

Saída: `error: Cannot find module '../../src/trips/domain/dispatch-readiness.policy.js'` —
0 pass, 1 fail, 1 error. Falha esperada: o módulo ainda não existe.

Commit: `0fa359854` — test(trips): tabela de casos de resolveDispatchReadiness (spec 185 T1.1).

## T1.2 — implementação de `dispatch-readiness.policy.ts`

Comando: `bun --env-file=../../.env.test test --timeout 120000 test/trips.contract.test.ts`
→ `79 pass, 0 fail, 235 expect() calls`.

Comando: `bun --env-file=../../.env.test test --timeout 120000` (suíte de contrato inteira, de
`apps/api-transportada`) → `7237 pass, 23 skip, 0 fail, 24362 expect() calls` em 183 arquivos.

Comando: `bun run typecheck` (raiz) → sem erros nas seis apps (api, worker, cron, frontend,
frontend-client, frontend-landing).

Comando: `bunx eslint` e `bunx prettier --check` em `dispatch-readiness.policy.ts`,
`dispatch-readiness.contract.ts` e `trips.contract.test.ts` → ambos limpos (exit 0).

Integração não exercitada nesta fase — a função é pura, sem I/O (RF1 do spec.md).

Commit: `77f6879d4` — feat(trips): resolveDispatchReadiness, a conta pura da carga fechada
(spec 185 T1.2).

## T2.1 — teste de "a viagem segue sem a nota" no catálogo

Suítes: `test/trip-occurrence/leaves-document-behind-schema.contract.ts` (schema do PUT: ausente não
decide, aceita true/false, recusa não-booleano), `test/trip-occurrence/leaves-document-behind.contract.ts`
(caso de uso: entrega com `true` → 422 `OCCURRENCE_TYPE_LEAVES_BEHIND_REQUIRES_SEPARATION`) e
`test/integration/occurrence-type-leaves-document-behind.integration.ts` (Postgres). Falharam antes da
implementação (campo/coluna inexistentes).

Commit: `f71b5620a` — test(trips): catálogo aprende "segue sem a nota" (spec 185 T2.1).

## T2.2 — coluna, CHECK, GET/PUT

Migration `20260924201710_occurrence_type_leaves_document_behind` (aditiva: `ADD COLUMN ... boolean
DEFAULT false NOT NULL` + CHECK `stage = 'separation' or not leaves_document_behind`) com `rollback.sql`.
PUT no molde de `attachmentMode` (ausente = não mexe). Revisão do orquestrador: tipo que não é de
separação grava sempre `false` — mudar o estágio de um tipo marcado, sem mandar o campo, batia na
CHECK e virava 500; caso novo na integração, e a prova da CHECK passou a usar escrita direta.

Gates (banco nativo descartável 127.0.0.1:65433, PG 18.4):
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-leaves-document-behind.integration.ts` → 4 pass, 0 fail
- `bun run db:test` (migration + rollback) → 110 pass, 0 fail
- `bun run db:generate --name probe` → `{"status":"no_changes"}`
- contrato inteiro `bun --env-file=../../.env.test test --timeout 120000` → 7243 pass, 23 skip, 0 fail
- integração inteira `bun --env-file=../../.env.test run test:integration` → 586 pass, 0 fail, 107 arquivos (318 s)
- `bun run typecheck` (raiz) limpo; eslint e prettier nos arquivos tocados limpos.
