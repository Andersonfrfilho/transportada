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
