# Tasks — 275 O aviso da ocorrência do motorista chega ao painel

> Gate: `bun run typecheck` + `bun run lint` + `bun --env-file=../../.env.test run test` + integração tocada com
> `--env-file` sem skip (cwd `apps/api-transportada`). Commits isolados.

- [x] **T1** `opus` — Spec, plan, tasks, evidence; leitura de 079/156/183/267/271 contra o código.
- [x] **T2** `opus` — Contrato vermelho (`driver-notification.contract.ts`) → caso de uso, política, serviço, leitor,
      `main.ts`. Aceite: contrato verde, script `test` verde.
- [x] **T3** `opus` — Integração `driver-occurrence-notification.integration.ts` no `test:integration`. Aceite: verde,
      zero skip.
- [x] **T4** `haiku` — `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md`.
