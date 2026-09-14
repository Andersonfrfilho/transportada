# Spec 145 — Plano

> 🤖 Modelo: `opus` 🧠 nas fases 1 (T1), 2 (T3) e 3 (T9) · `sonnet` nas fases 0, 1 (T2), 2 (T4–T6), 3
> (T7–T8) e 4–5 · `haiku` na fase 6

Base: `work/cargo-missing-box` sobre `origin/staging`, worktree
`../transportada-wt/cargo-missing-box`. A branch já traz o padrão de indicador de carregamento que a
D4 usa como precedente (`7ef269ad`, `66700e6a` presentes no histórico local; `8ffcb91a` mais atrás)
— conferir com `git log --oneline` antes de copiar o padrão, a branch segue recebendo correções de
carga de outras tasks. Contrato vermelho antes do código em toda fase que tem contrato.

## Fase 0 — Índices que faltam (`sonnet`)

Onde: `apps/api-transportada/src/database/nfe.schema.ts` (`nfeProducts` ~542–577, `nfeVolumes`
~417–448, `nfe_package_boxes` ~495–520), espelhado em
`apps/worker-transportada/src/database/nfe.schema.ts`.

- `nfe_volumes_company_document_idx (company_id, document_id)`,
  `nfe_products_company_document_idx (company_id, document_id)`, índice parcial
  `nfe_package_boxes (company_id) where measured_at is not null`.
- Migration aditiva via `bun run db:generate`; contrato de schema confere nome e forma dos três
  índices.
- Evidência de `EXPLAIN` antes/depois sobre a consulta de `trip-occupancy.support.ts:446-456` em
  `evidence.md` — é a única task desta fase que não depende do resto da spec, e destrava sozinha
  parte do problema medido.

## Fase 1 — O empacotador vira pacote (🧠 `opus` em T1)

Onde: `apps/api-transportada/src/trips/domain/{cargo-placement.policy,cargo-layout.policy,
cargo-edge-grid,cargo-plan.policy}.ts` + `shared/decimal.service.ts` (~163 KB) e
`test/cargo-placement/*.contract.ts`, movendo para `~/Documents/personal/adatechnology-packages`.

- **T1 roda no outro repositório**, não neste. Cria `@adatechnology/cargo-placement` em `rc`,
  move o domínio e as suítes de contrato para lá, publica localmente (workspace/`bun link` ou
  registro interno — conferir o padrão do repo de packages antes de escolher) e **pausa para o
  usuário antes de qualquer publicação definitiva** (D2/fora do escopo).
- T2, de volta neste repo: o pacote ganha o parâmetro `deadline`, threaded por
  `resolveStopArrangement → placeCargo → packUntilItFits (:633) → packSlice (:997)`; motivo novo
  `time_budget` em `unplaced` quando o `deadline` vence (D9, G003). Contrato vermelho
  (`budget.contract.ts`) antes da implementação.
- API troca o import do domínio local pelo pacote; testes finos de re-export confirmam a superfície
  (G002). Nenhuma regra física muda (D6/G013) — é mover código, não reescrevê-lo.

## Fase 2 — Schema e pedido de layout, no lado da API (🧠 `opus` em T3)

Onde: `apps/api-transportada/src/trips/` (novo módulo ou pasta `cargo-layout/`, a decidir na
implementação, seguindo o padrão de módulo já usado em `trips/`), migration em
`apps/api-transportada/src/database/`, espelho em `apps/worker-transportada/src/database/`.

- **T3** — `trip-cargo-layout.schema.ts` + migration: tabela `trip_cargo_layouts` exatamente como a
  D5 descreve (PK uuid, `trip_id` opcional com FK composta `(company_id, trip_id)` → `trips`,
  `CHECK` de `status` sem `pgEnum`, `input jsonb`, `layout jsonb` opcional, `unique(company_id,
input_hash)`, índice `(company_id, trip_id)`); mirror no worker. Contrato de schema cobre as
  constraints.
- **T4** — `cargo-layout-hash.policy.ts`: `buildCargoLayoutInput` monta o retrato canônico da D6 a
  partir do que `resolveCargoLayout` já recebe hoje (`drizzle-trip.repository.ts:786-830` e
  `preview-trip-cargo.use-case.ts:101`); `hashCargoLayoutInput` aplica `sha256(canonicalJson(...))`.
  Contrato: estável sob mudança cosmética (label/clientName/noteNumbers); muda com reorder, troca de
  caixa, troca de baú, `loadingAccess`, `securesCargo` ou `policyVersion` (G005).
- **T5** — `request-cargo-layout.use-case.ts` + `upsertCargoLayoutRequest` no repositório: upsert
  `queued` + linha na outbox `trip_cargo_layout_outbox`, na mesma transação; no-op quando já existe
  registro `queued`/`running`/`ready` com o mesmo hash (G006).
- **T6** — Liga o gatilho eager de T5 aos use cases que mexem em parada/caixa da D7:
  `trip.use-case.ts:112 create`, `linkDocument`/`releaseDocument`/`linkDocumentsBatch`
  (`drizzle-trip.repository.ts:240`, `link-trip-documents-batch.use-case.ts`),
  `reorder-trip-stops.use-case.ts`, `override-delivery-address.use-case.ts`,
  `reconcile-trip-stops.use-case.ts`. Estende os contratos em `test/trip-stops/` e
  `test/trip-documents/`.

## Fase 3 — O worker calcula (🧠 `opus` em T9)

Onde: `apps/worker-transportada/src/` — módulo novo (nome a decidir seguindo o padrão de
`aggregate-attachment/` e `routing/`), `messaging/`, `outbox/`, `main.ts`.

- **T7** — Envelope `transportada.trip.cargo-layout.requested` v1, no formato de
  `messaging/aggregate-attachment-envelope.schema.ts`, payload `{ layoutId, inputHash }`; topologia
  no padrão de `messaging/route-optimization-topology.ts` (principal/retry 30 s ×2/morta). Novos
  arquivos de teste entram na lista explícita de `apps/worker-transportada/package.json`.
- **T8** — Relay dedicado espelhando
  `aggregate-attachment/application/aggregate-attachment-outbox-relay.service.ts` sobre
  `outbox/application/outbox-relay-loop.service.ts`; repositório da outbox nova.
- **T9** — Handler: reivindicação atômica por hash (`UPDATE ... SET status='running' WHERE
status='queued' AND input_hash=$hash`; reivindicação nula → confirma e descarta); execução numa
  `new Worker()` de thread (precedente `aggregate-attachment/infrastructure/
threaded-extraction.gateway.ts` + `pdf-extraction.worker.ts`, registrada em `build` e em
  `test/build-entrypoints.contract.test.ts`) com `CARGO_LAYOUT_TIME_BUDGET_MS` (padrão 60000);
  sucesso grava `ready` (com `truncated: true` se o budget cortou, D9); falha transitória → retry e
  depois `failed`; consumidor com prefetch 1, ligado em `worker/src/main.ts:1155-1190` no padrão de
  `runtime/route-optimization-consumer.service.ts` (G009). Contrato: reivindicação nula → ack;
  hash superado → ack; transitória → retry então falha; budget → `ready` truncado.

## Fase 4 — API lê o que o worker guardou (`sonnet`)

Onde: `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts`,
`trips/application/preview-trip-cargo.use-case.ts`, `trips/presentation/trip.routes.ts:1275`,
`trips/domain/trip.port.ts`.

- **T10** — `readTripDetail` devolve layout `ready` com hash igual; senão o último `ready` com
  `stale: true`; resposta ganha `cargoLayoutState` (D10); dispara o gatilho lazy (recalcula o hash
  com o dado já carregado, enfileira em transação curta separada se não bater); serialização em
  `trip.routes.ts:1275`. `test/trip-detail-query-count.integration.ts` confirma orçamento de
  consultas inalterado (G011). `bedDimensions === null` continua saindo direto (D10).
- **T11** — Prévia (`preview-trip-cargo.use-case.ts`) devolve `{ layoutId, state }` enfileirado por
  hash; rota nova `GET /trips/cargo-layouts/:layoutId` para polling; env
  `CARGO_LAYOUT_TIME_BUDGET_MS` entra no schema de ambiente e em `.env.example`
  (`test/env-example.contract.test.ts`).

## Fase 5 — Frontend (`sonnet`)

Onde: `apps/frontend-transportada/src/modules/trip/` — `shared/trip.types.ts` (~306, ~430),
`shared/tripResponse.validation.ts` (~745), `components/TripDetail.component.tsx` (~423),
`components/TripCargoLayers.component.tsx`, `hooks/useTripWorkspace.hook.ts` (`~233
resolveTripRefetchInterval`, `~306`).

- **T12** — `cargoLayoutState` opcional nos tipos e na validação Zod (chave ausente = API antiga);
  intervalo de polling ligado ao novo `GET /trips/cargo-layouts/:layoutId` enquanto `pending`.
- **T13** — `TripCargoLayers.component.tsx`: esqueleto do baú + layout anterior como fantasma
  translúcido + selo "reorganizando a carga" enquanto pendente; animação suave de reposicionamento
  quando o layout novo chega (caixa que sai esmaece, que muda desliza, nova esmaece entrando),
  usando o padrão de loading das specs anteriores e `shadcn/ui`, sem mascote. Testes de validação e
  de intervalo de polling.

## Fase 6 — Documentação (`haiku`)

- **T14** — ADR "a planta é do worker", estendendo ADR-0044 §7; ponteiro em
  `docs/domain/cargo-placement-defects.md`; `apps/api-transportada/CLAUDE.md` e
  `apps/worker-transportada/CLAUDE.md` apontando para a spec; entrada nova em
  `docs/ai-context/api-transportada.md`.

## Riscos

- **T1 depende de decisão fora deste repositório** (como o pacote é versionado e publicado no repo
  de packages) — se o padrão de lá divergir do assumido aqui, T1 pausa e pergunta antes de inventar
  um mecanismo de publicação novo.
- **Deadline dentro de `new Worker()`**: o budget precisa ser checado dentro do laço de empacotamento
  (T2), não só por fora — um `setTimeout` externo mataria a thread no meio de uma escrita e deixaria
  o registro em `running` para sempre; o handler (T9) trata isso com o timeout do próprio `Worker`
  mais um teto de wall-clock no lado do handler, igual ao padrão de `threaded-extraction.gateway.ts`.
- **Corrida entre o gatilho eager e o lazy**: os dois podem pedir o mesmo hash quase ao mesmo tempo;
  o `unique(company_id, input_hash)` da D5 e o upsert idempotente de T5 resolvem sem duplicar linha
  nem mensagem.
- **Prévia sem `trip_id`, depois viagem criada com o mesmo hash**: T10/T11 devem reaproveitar a
  linha por hash, não recalcular; testar explicitamente esse caminho (D3), inclusive quando a
  prévia ainda está `queued` no momento em que a viagem nasce.
- **Janela de deploy**: enquanto a API antiga ainda roda ao lado do frontend novo (ou vice-versa),
  `cargoLayoutState` ausente não pode quebrar a tela (T12) nem o front antigo pode quebrar com a
  chave presente.
