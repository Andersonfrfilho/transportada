# Tasks — Feature 185

Uma task por vez. Cada uma fecha com typecheck + testes + commit isolado, e evidência em
`evidence.md`. Teste de aceite **antes** da implementação. Tasks que tocam `test/integration/**` só
fecham com o comando de integração (`bun --env-file=../../.env.test run test:integration`).

## Fase 1 — A conta da carga fechada

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Teste de domínio de `resolveDispatchReadiness` (D1): vivas × liberadas × devolvidas;
      ocorrência total de tipo "segue sem" tira da conta; parcial não; `loaded` com ocorrência
      continua carga; zero `loaded` não fecha — `test/trips/dispatch-readiness.contract.ts`.
- [x] **T1.2** `trips/domain/dispatch-readiness.policy.ts` até o T1.1 passar.

## Fase 2 — O catálogo aprende "segue sem a nota"

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Teste (CA06): GET devolve, PUT grava, ausente não apaga, tipo de entrega com `true`
      → 422.
- [x] **T2.2** Coluna + CHECK + migration aditiva com `rollback.sql`; GET/PUT/`saveOccurrenceType`
      no molde de `attachmentMode`; código de erro novo. Fecha com `make migration-test`.

## Fase 3 — O despacho libera o que fica e leva o que falta

> 🤖 Modelo: 🧠 `opus` (transação, travas e compare-and-set do `dispatch()`)

- [x] **T3.1** Teste de integração (CA04, CA05): `loadRemaining` carrega e despacha numa transação;
      gate recusado não altera nota; nota deixada para trás é liberada com motivo; `loadRemaining`
      + `force` → 400.
- [x] **T3.2** Query de prontidão ao lado de `readPreconditions`; `dispatch-trip.use-case.ts` com
      D3; rota e OpenAPI com `loadRemaining`.

## Fase 4 — O gatilho automático

> 🤖 Modelo: 🧠 `opus` (T4.3 concorrência); T4.1/T4.2 `sonnet`

- [x] **T4.1** Teste de integração (CA01, CA02, CA03): carregar a última nota (linha, lote,
      WhatsApp) despacha com ator e canal; gate de agendamento devolve `autoDispatch.blocked` com
      `stopIds` e a nota fica `loaded`.
- [x] **T4.2** `try-auto-dispatch-trip.use-case.ts` e a ligação nos quatro chamadores (D4); campo
      `autoDispatch` nas respostas; frase no retorno do WhatsApp.
- [ ] **T4.3** 🧠 Teste de integração (CA09): duas cargas concorrentes das duas últimas notas
      despacham uma vez, sem erro.

## Fase 5 — Sem "Conferir carga"

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Teste (CA07): `allowed-actions` sem `confirmLoad`; `confirm-load` ainda 200.
- [ ] **T5.2** Policy de `allowed-actions`; ajustar os contratos que citavam `confirmLoad`.

## Fase 6 — A tela

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** Contratos: `dispatchReadiness.service.ts` espelha D1; frases de
      `TRIP_HAS_UNSCHEDULED_STOPS`/`TRIP_HAS_NO_ROUTE`; diálogo "leva todas" com contagem; sem
      "Conferir carga" (escritório e motorista); `autoDispatch` lido nas mutations; caixa do
      catálogo só em separação; fase "Despachada" no `TripProcessFlow`.
- [ ] **T6.2** Implementação até os contratos passarem; locales pt-BR (acentuado) e en.

## Fase 7 — Revisão

> 🤖 Modelo: `sonnet` (prints) · `opus` (code-reviewer)

- [ ] **T7.1** Revisão de design (web.md §15): prints do diálogo "leva todas", do aviso "Viagem
      despachada", da frase de bloqueio e da caixa do catálogo, claro e escuro, celular e desktop,
      em `prints/`.
- [ ] **T7.2** Revisão de código por `code-reviewer` (`opus`) sobre a spec inteira; atualizar
      `apps/api-transportada/CLAUDE.md` ("a nota nunca é presa" / 164 D8) e
      `docs/ai-context/*` com a ADR-0074.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/185-carregou-tudo-a-viagem-sai/ (leia spec.md,
plan.md, tasks.md e docs/adr/0074-carregou-tudo-a-viagem-sai.md antes de começar). Uma task por vez,
na ordem do tasks.md, num worktree próprio (make worktree NAME=spec-185).
Modelos: Fase 1, 2, 5, 6 → executor model=sonnet · Fase 3 → opus · Fase 4 T4.1/T4.2 → executor
model=sonnet, T4.3 🧠 → opus · T7.1 → executor model=sonnet · T7.2 → code-reviewer model=opus.
Cada task fecha com typecheck + testes (contrato E integração da API quando tocar banco; make
migration-test na Fase 2) + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, qualquer [NEEDS CLARIFICATION].
Staging: publicar com gates verdes (fetch → rebase origin/staging → install → gates → push).
```
