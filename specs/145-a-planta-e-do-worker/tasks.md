# Spec 145 — Tarefas

| fase | modelo                            |
| ---- | --------------------------------- |
| 0    | `sonnet`                          |
| 1    | `opus` 🧠 (T1) · `sonnet` (T2)    |
| 2    | `opus` 🧠 (T3) · `sonnet` (T4–T6) |
| 3    | `sonnet` (T7–T8) · `opus` 🧠 (T9) |
| 4    | `sonnet`                          |
| 5    | `sonnet`                          |
| 6    | `haiku`                           |

## Fase 0 — Índices que faltam (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T0 — `nfe_volumes_company_document_idx`, `nfe_products_company_document_idx` e o índice
      parcial `nfe_package_boxes (company_id) where measured_at is not null` em
      `apps/api-transportada/src/database/nfe.schema.ts`, espelhados no worker; migration aditiva
      (`bun run db:generate`); contrato de schema confere nome e forma (G001); `EXPLAIN`
      antes/depois da consulta de `trip-occupancy.support.ts:446-456` registrado em `evidence.md`.

## Fase 1 — O empacotador vira pacote (🧠 `opus` em T1)

> 🤖 Modelo: `opus` (T1) · `sonnet` (T2)

- [ ] T1 🧠 — **Roda no repositório `~/Documents/personal/adatechnology-packages`, não aqui.** Cria
      `@adatechnology/cargo-placement` em `rc`; move `trips/domain/{cargo-placement.policy,
cargo-layout.policy,cargo-edge-grid,cargo-plan.policy}.ts` + `shared/decimal.service.ts` e as
      suítes `test/cargo-placement/*.contract.ts` para lá; API passa a importar o pacote; testes
      finos de re-export no app confirmam a superfície (G002). **Pausa e pergunta ao usuário antes
      de publicar** o pacote em qualquer registro além do link local de desenvolvimento.
- [ ] T2 — Parâmetro `deadline` threaded por `resolveStopArrangement → placeCargo →
packUntilItFits (:633) → packSlice (:997)`, no pacote; motivo novo `time_budget` em
      `unplaced` quando vence (D9); contrato `budget.contract.ts` **vermelho antes** do código
      (G003). Nenhuma regra física muda (apoio 80%, escora, célula 5 cm, `STABLE_STACK_SLENDERNESS`
      — G013).

## Fase 2 — Schema e pedido de layout (🧠 `opus` em T3)

> 🤖 Modelo: `opus` (T3) · `sonnet` (T4–T6)

- [ ] T3 🧠 — `trip-cargo-layout.schema.ts` + migration: tabela `trip_cargo_layouts` com os campos
      e constraints da D5 (PK uuid, `trip_id` opcional com FK composta `(company_id, trip_id)`,
      `CHECK` de `status` sem `pgEnum`, `unique(company_id, input_hash)`, índice `(company_id,
trip_id)`); mirror em `apps/worker-transportada/src/database/`. Contrato de schema cobre as
      constraints (G004).
- [ ] T4 — `cargo-layout-hash.policy.ts`: `buildCargoLayoutInput` + `hashCargoLayoutInput`
      (`sha256(canonicalJson(...))`, D6). Contrato: estável sob mudança cosmética
      (label/clientName/noteNumbers); muda com reorder, troca de caixa, troca de baú,
      `loadingAccess`, `securesCargo`, `policyVersion` (G005).
- [ ] T5 — `request-cargo-layout.use-case.ts` + `upsertCargoLayoutRequest` no repositório: upsert
      `queued` + linha na outbox `trip_cargo_layout_outbox` na mesma transação; no-op quando já há
      registro `queued`/`running`/`ready` com o mesmo hash (G006).
- [ ] T6 — Liga o gatilho eager de T5 aos use cases da D7: `trip.use-case.ts:112 create`,
      `linkDocument`/`releaseDocument`/`linkDocumentsBatch` (`drizzle-trip.repository.ts:240`,
      `link-trip-documents-batch.use-case.ts`), `reorder-trip-stops.use-case.ts`,
      `override-delivery-address.use-case.ts`, `reconcile-trip-stops.use-case.ts`. Estende
      `test/trip-stops/` e `test/trip-documents/`.

## Fase 3 — O worker calcula (🧠 `opus` em T9)

> 🤖 Modelo: `sonnet` (T7–T8) · `opus` (T9)

- [ ] T7 — Envelope `transportada.trip.cargo-layout.requested` v1 (formato de
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
/oh-my-claudecode:autopilot Execute a spec specs/145-a-planta-e-do-worker/ (leia spec.md, plan.md e
tasks.md antes de começar). Trabalhe no worktree ../transportada-wt/cargo-missing-box, branch
work/cargo-missing-box. Uma task por vez, na ordem do tasks.md, contrato vermelho antes do código em
toda task que tem contrato.
Modelos: Fase 0 (T0) → executor model=sonnet · Fase 1 T1 🧠 → opus, RODA NO REPOSITÓRIO
~/Documents/personal/adatechnology-packages, não neste — pausa e pergunta antes de publicar o
pacote · Fase 1 T2 → executor model=sonnet · Fase 2 T3 🧠 → opus · Fase 2 T4–T6 → executor
model=sonnet · Fase 3 T7–T8 → executor model=sonnet · Fase 3 T9 🧠 → opus · Fases 4–5 (T10–T13) →
executor model=sonnet · Fase 6 (T14) → executor model=haiku · revisão final → code-reviewer
model=opus.
Cada task fecha com bun run typecheck + os testes de contrato relevantes daquele app + commit
isolado (sem push), evidência em specs/145-a-planta-e-do-worker/evidence.md.
Não mude apoio de 80%, escora, célula de 5 cm, slenderness nem nenhuma outra regra física do
empacotador (D6/G013). Teste novo entra na lista explícita do package.json do app correspondente.
Pare e pergunte antes de: push, publicar o pacote além do link local de desenvolvimento, deploy,
qualquer migration além das aditivas de D5/D11, qualquer regra de negócio fora de D1–D12, qualquer
[NEEDS CLARIFICATION].
```
