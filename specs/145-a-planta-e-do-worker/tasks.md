# Spec 145 — Tarefas

| fase | tasks   | estado   | modelo recomendado | fallback se o recomendado der 429 |
| ---- | ------- | -------- | ------------------ | --------------------------------- |
| 0    | T0      | ✅ feita | `sonnet`           | `opus`                            |
| 1    | T1 🧠   | ✅ feita | `opus`             | `fable`                           |
| 1    | T2      | ✅ feita | `sonnet`           | `opus`                            |
| 2    | T3 🧠   | ✅ feita | `opus`             | `fable`                           |
| 2    | T4–T6b  | ✅ feita | `sonnet`           | `opus`                            |
| 3    | T7–T8   | pendente | `sonnet`           | `opus`                            |
| 3    | T9 🧠   | pendente | `opus`             | `fable`                           |
| 4    | T10–T11 | pendente | `sonnet`           | `opus`                            |
| 5    | T12–T13 | pendente | `sonnet`           | `opus`                            |
| 6    | T14     | pendente | `haiku`            | `sonnet` → `opus`                 |
| —    | revisão | pendente | `opus`             | `fable`                           |

**Troca de modelo sem `/model`:** cada task vai para um subagente com `model=<recomendado>`. A
sessão que orquestra só lê, delega, verifica e faz o commit. A troca fica no parâmetro da delegação,
não na sessão.

**Regra de fallback:** se o subagente morrer com `rate_limit`/HTTP 429 ("weekly limit"):

1. Rodar `git status --short` no worktree. Se houver alteração pela metade, entregá-la ao fallback
   junto com o briefing, sem descartar nada e sem `git stash`.
2. Redelegar a **mesma** task ao modelo de fallback da tabela, com o mesmo briefing.
3. Registrar no `evidence.md` da task: "rodou em `<fallback>`: `<recomendado>` sem cota até
   `<data do reset>`".
4. Enquanto o recomendado estiver sem cota, as tasks seguintes dele vão direto para o fallback, sem
   tentar de novo a cada task.

Nunca descer de modelo: task 🧠 não roda em `sonnet`/`haiku`, mesmo com `opus` sem cota. Se
`opus` e `fable` estiverem sem cota, parar e perguntar.

⚠️ Em 2026-09-12 o `sonnet` está sem cota até **2026-09-14 09:00 (America/Sao_Paulo)**. A T6b já
rodou em `opus` por isso.

## Fase 0 — Índices que faltam (`sonnet`)

> 🤖 Modelo: `sonnet`

- [x] T0 — `nfe_volumes_company_document_idx`, `nfe_products_company_document_idx` e o índice
      parcial `nfe_package_boxes (company_id) where measured_at is not null` em
      `apps/api-transportada/src/database/nfe.schema.ts`, espelhados no worker; migration aditiva
      (`bun run db:generate`); contrato de schema confere nome e forma (G001); `EXPLAIN`
      antes/depois da consulta de `trip-occupancy.support.ts:446-456` registrado em `evidence.md`.

## Fase 1 — O empacotador vira pacote (🧠 `opus` em T1)

> 🤖 Modelo: `opus` (T1) · `sonnet` (T2)

- [x] T1 🧠 — **Roda no repositório `~/Documents/personal/adatechnology-packages`, não aqui.** Cria
      `@adatechnology/cargo-placement` em `rc`; move `trips/domain/{cargo-placement.policy,
cargo-layout.policy,cargo-edge-grid,cargo-plan.policy}.ts` + `shared/decimal.service.ts` e as
      suítes `test/cargo-placement/*.contract.ts` para lá; API passa a importar o pacote; testes
      finos de re-export no app confirmam a superfície (G002). **Pausa e pergunta ao usuário antes
      de publicar** o pacote em qualquer registro além do link local de desenvolvimento.
- [x] T2 — Parâmetro `deadline` threaded por `resolveStopArrangement → placeCargo →
packUntilItFits (:633) → packSlice (:997)`, no pacote; motivo novo `time_budget` em
      `unplaced` quando vence (D9); contrato `budget.contract.ts` **vermelho antes** do código
      (G003). Nenhuma regra física muda (apoio 80%, escora, célula 5 cm, `STABLE_STACK_SLENDERNESS`
      — G013).

## Fase 2 — Schema e pedido de layout (🧠 `opus` em T3)

> 🤖 Modelo: `opus` (T3) · `sonnet` (T4–T6)

- [x] T3 🧠 — `trip-cargo-layout.schema.ts` + migration: tabela `trip_cargo_layouts` com os campos
      e constraints da D5 (PK uuid, `trip_id` opcional com FK composta `(company_id, trip_id)`,
      `CHECK` de `status` sem `pgEnum`, `unique(company_id, input_hash)`, índice `(company_id,
trip_id)`); mirror em `apps/worker-transportada/src/database/`. Contrato de schema cobre as
      constraints (G004).
- [x] T4 — `cargo-layout-hash.policy.ts`: `buildCargoLayoutInput` + `hashCargoLayoutInput`
      (`sha256(canonicalJson(...))`, D6). Contrato: estável sob mudança cosmética
      (label/clientName/noteNumbers); muda com reorder, troca de caixa, troca de baú,
      `loadingAccess`, `securesCargo`, `policyVersion` (G005).
- [x] T5 — `request-cargo-layout.use-case.ts` + `upsertCargoLayoutRequest` no repositório: upsert
      `queued` + linha na outbox `trip_cargo_layout_outbox` na mesma transação; no-op quando já há
      registro `queued`/`running`/`ready` com o mesmo hash (G006).
- [x] T6 — Liga o gatilho eager de T5 aos use cases da D7: `trip.use-case.ts:112 create`,
      `linkDocument`/`releaseDocument`/`linkDocumentsBatch` (`drizzle-trip.repository.ts:240`,
      `link-trip-documents-batch.use-case.ts`), `reorder-trip-stops.use-case.ts`,
      `override-delivery-address.use-case.ts`, `reconcile-trip-stops.use-case.ts`. Estende
      `test/trip-stops/` e `test/trip-documents/`.
- [x] T6b — A coluna `input` guarda a entrada inteira de `resolveCargoLayout` (D5), não o retrato
      canônico do hash: rótulo, cliente, números de nota e volume por parada iguais aos do
      `readTripDetail`, para o worker (T9) empacotar sem reler a viagem. O hash (D6) não muda.

## Fase 3 — O worker calcula (🧠 `opus` em T9)

> 🤖 Modelo: `sonnet` (T7–T8) · `opus` (T9)

- [x] T7 — Envelope `transportada.trip.cargo-layout.requested` v1 (formato de
      `messaging/aggregate-attachment-envelope.schema.ts`, payload `{ layoutId, inputHash }`);
      topologia principal/retry 30 s ×2/morta no padrão de
      `messaging/route-optimization-topology.ts`. Testes novos entram na lista explícita de
      `apps/worker-transportada/package.json` (G008).
- [ ] T8 — Relay dedicado espelhando
      `aggregate-attachment/application/aggregate-attachment-outbox-relay.service.ts` sobre
      `outbox/application/outbox-relay-loop.service.ts`; repositório da outbox nova (G008).
- [ ] T9 🧠 — Handler: reivindicação atômica por hash (`UPDATE ... SET status='running' WHERE
status='queued' AND input_hash=$hash`; nula → confirma e descarta; hash superado → confirma e
      descarta); execução em `new Worker()` de thread (padrão
      `aggregate-attachment/infrastructure/threaded-extraction.gateway.ts` +
      `pdf-extraction.worker.ts`, registrada em `build` e em
      `test/build-entrypoints.contract.test.ts`) com `CARGO_LAYOUT_TIME_BUDGET_MS`; falha
      transitória → retry e depois `failed`; sucesso grava `ready` (`truncated: true` se o budget
      cortou); consumidor prefetch 1 ligado em `worker/src/main.ts:1155-1190` (G009).

## Fase 4 — API lê o que o worker guardou (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T10 — `readTripDetail` devolve layout `ready` com hash igual; senão o último `ready` com
      `stale: true`; `cargoLayoutState` na resposta (`trip.routes.ts:1275`); dispara o gatilho lazy
      (recalcula hash, enfileira em transação curta separada se não bater); `bedDimensions === null`
      continua sem chamar o pacote. `test/trip-detail-query-count.integration.ts` confirma
      orçamento de consultas inalterado (G010, G011).
- [ ] T11 — Prévia devolve `{ layoutId, state }` por hash; rota nova `GET
/trips/cargo-layouts/:layoutId` para polling; `CARGO_LAYOUT_TIME_BUDGET_MS` no schema de
      ambiente e em `.env.example` (`test/env-example.contract.test.ts`) (G010).

## Fase 5 — Frontend (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T12 — `cargoLayoutState` opcional em `trip.types.ts` (~306, ~430) e em
      `tripResponse.validation.ts` (~745, chave ausente = API antiga); intervalo de polling contra
      `GET /trips/cargo-layouts/:layoutId` enquanto `pending`, no padrão de
      `useTripWorkspace.hook.ts:233 resolveTripRefetchInterval`/`:306`.
- [ ] T13 — `TripCargoLayers.component.tsx`: esqueleto do baú + fantasma translúcido do layout
      anterior + selo "reorganizando a carga" enquanto pendente; animação suave de reposicionamento
      quando o layout novo chega (sai esmaecendo, muda deslizando, entra esmaecendo); padrão de
      loading das specs anteriores (`7ef269ad`, `66700e6a`, `8ffcb91a`) e `shadcn/ui`, sem mascote
      (G012). Testes de validação e do intervalo de polling.

## Fase 6 — Documentação (`haiku`)

> 🤖 Modelo: `haiku`

- [ ] T14 — ADR "a planta é do worker" (estende ADR-0044 §7); ponteiro em
      `docs/domain/cargo-placement-defects.md`; `apps/api-transportada/CLAUDE.md` e
      `apps/worker-transportada/CLAUDE.md` apontando para a spec 145; entrada em
      `docs/ai-context/api-transportada.md` (G014). `evidence.md` fechado, com o gate final
      (`bun run typecheck` + testes por app + `make check`, G015) registrado.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Continue a spec specs/145-a-planta-e-do-worker/ a partir da T7
(T0–T6b estão feitas e commitadas). Leia spec.md, plan.md, tasks.md e o fim do evidence.md antes
de começar. Trabalhe só no worktree ../transportada-wt/cargo-missing-box, branch
work/cargo-missing-box; confira `git status --short --branch` antes de cada task.

Você orquestra, não implementa: cada task vai para um subagente com o modelo da tabela do
tasks.md. Você lê, delega, verifica o resultado e faz o commit.
Ordem e modelos: T7 → executor model=sonnet · T8 → executor model=sonnet · T9 🧠 → executor
model=opus (plano validado antes por architect model=opus) · T10, T11 → executor model=sonnet ·
T12, T13 → executor model=sonnet (designer model=sonnet se a T13 pedir) · T14 → writer
model=haiku · revisão final → code-reviewer model=opus.
Uma task por vez, nunca duas em paralelo: T9 consome o evento da T7, T10 lê o que a T9 grava,
T12 depende da rota da T11.

Troca por limite de uso: se o subagente morrer com rate_limit / HTTP 429 / "weekly limit", siga a
"Regra de fallback" do tasks.md: preserve o que ficou na árvore (sem git stash), redelegue a
mesma task ao fallback (sonnet→opus, haiku→sonnet→opus, opus→fable), registre no evidence.md e
mantenha o fallback enquanto o recomendado estiver sem cota. Nunca rode task 🧠 em sonnet/haiku.
Se o fallback também der 429, pare e me avise com o horário do reset.

Cada briefing de subagente leva: a task do tasks.md, os arquivos e padrões que ela cita, as
decisões D1–D12 que ela toca, e o gate de fechamento. Cada task fecha com: contrato vermelho
antes do código (registre o fail) → implementação → bunx tsc --noEmit + bunx eslint nos arquivos
tocados + os testes do app (bun run --cwd apps/<app> test) → evidência em
specs/145-a-planta-e-do-worker/evidence.md → commit isolado, sem push. Teste novo entra na lista
explícita do package.json do app. Confira você mesmo o gate antes de marcar [x]; não aceite o
relatório do subagente sem rodar os testes.
Não mude apoio de 80%, escora, célula de 5 cm, slenderness nem nenhuma regra física do
empacotador (D6/G013).

Pare e pergunte antes de: push, deploy, publicar o pacote além do link local de desenvolvimento,
qualquer migration além das aditivas de D5/D11, qualquer regra de negócio fora de D1–D12, qualquer
[NEEDS CLARIFICATION], e ao fim da revisão final, antes de declarar a spec fechada.
```
