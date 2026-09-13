# Spec 145 — A planta é do worker

> 🤖 Modelo: `opus` 🧠 (extração do pacote de empacotamento, schema do layout armazenado, handler do
> worker) · `sonnet` (índices, hash de versionamento, use cases de pedido/leitura, envelope e relay,
> leitura da API, frontend) · `haiku` (documentação)

## Problema

`GET /trips/:id` chama `resolveCargoLayout(...)` de forma síncrona dentro de `readTripDetail`
(`apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts:786`); `POST
/trips/cargo-preview` faz o mesmo em `preview-trip-cargo.use-case.ts:101` (consumido por
`TripQuickCreateDialog` e `TripProposalDetail` via `useTripCargoPreview.hook.ts`). O empacotamento é
recalculado a cada requisição e nunca persiste.

Medido na viagem local `5715dd82` (51 paradas, 993 caixas): 16,9 s de CPU em 18 s de parede. O event
loop bloqueia, e o prazo de 8 s de toda consulta concorrente (`src/database/database-client.service.ts:150-184`,
`settleWithinDeadline`) estoura → 503 `DATABASE_UNAVAILABLE (query_timeout)` em `GET /trips/:id`
(16 685 ms), `GET /trips/:id/valuation` (16 675 ms) e `POST /trips/valuation-preview`. As rotas de
valuation não empacotam nada — são vítimas do bloqueio de uma rota vizinha, não autoras dele. A
proposta de roteirização (82 paradas, 1431 caixas) é ainda mais pesada.

Secundário: `nfe_products` (`nfe.schema.ts:542-577`) e `nfe_volumes` (`nfe.schema.ts:417-448`) só têm
a foreign key composta `(company_id, document_id)` — sem índice dedicado — e é por ela que a consulta
de caixas medidas (`trip-occupancy.support.ts:446-456`) varre.

## Decisão

- **D1 — O empacotamento sai do caminho da requisição.** Passa a rodar em
  `apps/worker-transportada`. API e telas leem um resultado já pronto, nunca calculam na hora.
- **D2 — O empacotador vira pacote.** O domínio de posicionamento
  (`trips/domain/{cargo-placement.policy,cargo-layout.policy,cargo-edge-grid,cargo-plan.policy}.ts` +
  `shared/decimal.service.ts`, ~163 KB) sai do app e vira `@adatechnology/cargo-placement`, no repo
  separado `~/Documents/personal/adatechnology-packages` — regra do monorepo: nenhuma app importa
  código-fonte de outra, biblioteca reaproveitável mora nos packages. API e worker passam a consumir
  o mesmo pacote. As suítes `test/cargo-placement/*.contract.ts` mudam de casa junto com o domínio; o
  app mantém só testes finos de re-export, para confirmar que a versão instalada expõe o que ele
  espera.
- **D3 — A prévia também entra na fila.** Prévia é o desenho da proposta de rota, antes de existir
  viagem. Os pedidos ficam em fila com chave `(company_id, input_hash)`; `trip_id` é opcional
  (`null` na prévia). Quando a viagem nasce com o mesmo hash de entrada, o layout já calculado é
  reaproveitado — não há novo cálculo só porque a viagem passou a existir.
- **D4 — A tela durante a espera.** Enquanto um layout está pendente, o frontend mostra o esqueleto
  do baú (wireframe) com o layout anterior como fantasma translúcido e um selo "reorganizando a
  carga"; quando o layout novo chega, as caixas animam suavemente da posição antiga para a nova
  (caixa que sai esmaece, caixa que muda de lugar desliza, caixa nova surge esmaecendo). Usa o
  padrão de indicador de carregamento já existente nesta branch (commits `8ffcb91a`, `7ef269ad`,
  `66700e6a`) e `shadcn/ui`; sem mascote nem personagem.
- **D5 — Onde o layout mora.** Tabela nova `trip_cargo_layouts`: `id uuid` PK; `company_id`;
  `trip_id` opcional (FK composta `(company_id, trip_id)` → `trips`); `status text` com `CHECK` em
  `('queued', 'running', 'ready', 'failed')` — sem `pgEnum` nativo (padrão do repositório); `input_hash
text`; `policy_version text`; `input jsonb` (o mesmo retrato de entrada que a API já monta hoje em
  `drizzle-trip.repository.ts:786-830` para `resolveCargoLayout`); `layout jsonb` opcional; `error_code
text`; `attempt bigint`; `duration_ms bigint`; `computed_at`; `created_at`; `updated_at`. `unique
(company_id, input_hash)`; índice `(company_id, trip_id)`. Não vira coluna de `trips` — tem ciclo de
  vida próprio, é reescrita pelo worker, e é megabytes de JSON que os endpoints de lista jamais podem
  carregar.
- **D6 — A chave que versiona.** `input_hash = sha256(canonicalJson({ policyVersion, capacityM3,
bed{l,w,h,source}, loadingAccess, securesCargo, payloadRatio, fallbackBoxVolumeM3, measuredShapes,
stops[ordenadas por sequence]{ sequence, boxes[]{ documentId, dims, qty, measured } } }))`.
  `labels`/`clientName`/`noteNumbers` ficam de fora — não mudam o desenho, só o rótulo. **Emenda (revisão final, 2026-09-13):** o retrato leva tudo o que o empacotador lê — também `volumeM3` e `documentsWithoutVolume` da parada e, por caixa, `estimatedVolumeM3`, `estimateSource`, `isFragile`, `isStackable`, `keepUpright`, `maxStackCount`; fora fica só etiqueta (`label`, `clientName`, `noteNumbers`, `documentNumber`, `productCode`). `policyVersion`
  é uma constante do pacote; mudá-la invalida todo layout guardado, de qualquer empresa.
- **D7 — Quem dispara o recálculo: eager e lazy.** Eager: os use cases que mexem nas paradas ou nas
  caixas de uma viagem (`trip.use-case.ts:112 create`; `linkDocument`/`releaseDocument`/
  `linkDocumentsBatch` em `drizzle-trip.repository.ts:240` e
  `link-trip-documents-batch.use-case.ts`; `reorder-trip-stops.use-case.ts`;
  `override-delivery-address.use-case.ts`; `reconcile-trip-stops.use-case.ts`) sobem um registro
  `queued` + um evento de outbox, na mesma transação da mudança. Lazy: `readTripDetail` recalcula o
  hash com o dado que já carregou (é barato — o dado já está em memória) e, se não bater com o
  registro guardado, o handler da rota enfileira depois da leitura, numa transação curta separada —
  isso cobre o baú/`loadingAccess` do veículo (`fleet.port.ts:48`), `securesCargo` do motorista
  (`fleet.port.ts:145`), `company_cargo_settings.fallback_box_volume`, e a medição de caixa
  (`nfe-documents/infrastructure/drizzle-package-box.repository.ts` e o worker
  `nfe-package-box-backfill.main.ts`) — sem espalhar gatilho por todos esses pontos. Um `GET` que
  grava esse enfileiramento idempotente é aceito: é uma escrita de "pedi para calcular", não uma
  escrita de domínio.
- **D8 — Como o pedido viaja até o worker.** Outbox dedicada, `trip_cargo_layout_outbox`, no mesmo
  desenho de `aggregateAttachmentOutbox` (`database/aggregate-application.schema.ts:214`), relayed
  pelo worker (`worker/src/aggregate-attachment/application/aggregate-attachment-outbox-relay.service.ts`
  - `outbox/application/outbox-relay-loop.service.ts`). Envelope
    `transportada.trip.cargo-layout.requested` v1, no formato de
    `worker/src/messaging/aggregate-attachment-envelope.schema.ts` (`eventId, type, version,
occurredAt, companyId, correlationId, payload`); `payload` é só `{ layoutId, inputHash }` —
    referência, nunca dado pessoal (o rótulo da parada é PII, e não viaja). `processed_messages` não
    serve de livro-razão aqui (tem FK para `processing_outbox.event_id`, `processing.schema.ts:195`);
    a idempotência é por reivindicação (claim), como em roteirização
    (`worker/src/routing/application/route-optimization-handler.service.ts`: `UPDATE ... SET
status='running' WHERE status='queued' AND input_hash=$hash`; reivindicação nula → confirma e
    descarta). Topologia como `messaging/route-optimization-topology.ts` (principal/retry 30 s ×2/
    morta), consumidor com prefetch 1, ligado em `worker/src/main.ts:1155-1190` e
    `runtime/route-optimization-consumer.service.ts`.
- **D9 — Onde e como o worker calcula.** A política pura roda numa `new Worker()` de thread
  (precedente `aggregate-attachment/infrastructure/threaded-extraction.gateway.ts` +
  `pdf-extraction.worker.ts`, registrado nos entrypoints de `build` e em
  `test/build-entrypoints.contract.test.ts`), com orçamento de tempo em relógio de parede pela env
  `CARGO_LAYOUT_TIME_BUDGET_MS`, padrão 60000. O pacote ganha um parâmetro `deadline`, passado por
  `resolveStopArrangement → placeCargo → packUntilItFits (:633) → packSlice (:997)`; ao vencer, as
  caixas que sobraram voltam como `unplaced` com um motivo novo, `time_budget` (a spec 085 proíbe
  sumir caixa em silêncio), e o layout é guardado `ready` com essas caixas em `unplaced` e
  `truncated: true`. Um erro lançado ou a thread morta viram `failed`, com código estável
  `CARGO_LAYOUT_TIME_BUDGET_EXCEEDED` / `CARGO_LAYOUT_FAILED`.
- **D10 — O que a API lê.** `readTripDetail` devolve o layout guardado quando `status='ready'` e o
  hash bate; senão, o último layout `ready` anterior (se houver), com `stale: true`. A resposta ganha
  `cargoLayoutState: { status: 'ready'|'pending'|'failed'|'unavailable', computedAt, errorCode, stale,
truncated }`, serializado em `presentation/trip.routes.ts:1275`. `bedDimensions === null` continua
  saindo direto, sem consultar o pacote (empacotador nem entra em cena). O endpoint de prévia devolve
  `{ layoutId, state }` e há uma rota nova, `GET /trips/cargo-layouts/:layoutId`, para o frontend
  perguntar de novo enquanto está pendente (a cada 3 s, no padrão de
  `useTripWorkspace.hook.ts:233 resolveTripRefetchInterval` e `:306`).
- **D11 — Índices.** `nfe_volumes_company_document_idx (company_id, document_id)`,
  `nfe_products_company_document_idx (company_id, document_id)`, e um índice parcial em
  `nfe_package_boxes (company_id) where measured_at is not null`. Migration aditiva via `bun run
db:generate`, espelhada em `apps/worker-transportada/src/database/nfe.schema.ts`.
- **D12 — Tipos do frontend.** `modules/trip/shared/trip.types.ts:306,430` ganham `cargoLayoutState`
  opcional (janela de deploy: front novo pode falar com API velha, que ainda não serve a chave);
  `tripResponse.validation.ts:745` aceita a chave ausente; `TripDetail.component.tsx:423` passa o
  estado adiante; `TripCargoLayers.component.tsx` ganha os ramos pendente/falho — hoje `null` quer
  dizer "meça o caminhão", o que fica errado enquanto o cálculo está em andamento.

### Decisões do usuário em 2026-09-12 (validação da T9) — prevalecem sobre D9/D10 onde divergem

- **D13 — Tempo esgotado tenta de novo com mais tempo.** O orçamento da tentativa N é
  `CARGO_LAYOUT_TIME_BUDGET_MS × 2^(N−1)`: 60 s, 120 s e 240 s, nas mesmas três tentativas da
  topologia. Se sobrar caixa `unplaced` com motivo `time_budget` e não for a última tentativa, o
  worker devolve a linha para `queued` e manda para o retry. Na terceira, grava `ready` como ficou.
  **Não há campo `truncated`:** "incompleta" é derivado na leitura (T10), de
  `unplaced[].reason === 'time_budget'`. Isso substitui o `truncated: true` gravado da D9 e o
  `truncated` como dado próprio da D10.
- **D14 — `running` órfão se recupera por lease.** O claim do worker também aceita `running` cujo
  `updated_at` é mais velho que o lease: orçamento da maior tentativa + 10 s de teto externo + 30 s de
  folga, derivado da env, sem variável nova. O upsert da API (T9b) reabre essa mesma linha, e com isso
  o gatilho lazy recupera uma planta presa quando alguém abre a viagem.
- **D15 — Capacidade desconhecida não enfileira.** Sem capacidade (nem ficha, nem referência do tipo),
  a API não pede cálculo e o estado é `unavailable`, com a tela igual a hoje. Se um pedido assim chegar
  ao worker, ele grava `failed` com `CARGO_LAYOUT_UNAVAILABLE` e confirma a mensagem, sem retry.
  Reduzir esses casos (carroceria `00`, cavalo sem carreta) é uma spec própria.
- **D16 — Nunca ficar sem resposta.** Todo caminho termina em `ready`, `failed` ou `unavailable`:
  - worker parado: a outbox segura o pedido até ele voltar;
  - worker morto no meio do cálculo: D14;
  - mensagem perdida ou recusada no decode, com a linha em `queued` sem ninguém calculando: o upsert
    da API também reabre `queued` com `updated_at` mais velho que o lease, e grava uma linha nova na
    outbox;
  - esgotadas as tentativas: `failed`, que a próxima mudança ou leitura reabre.

  No frontend (T12), o polling tem teto de 10 minutos, acima da soma da escada da D13 com os retries.
  Passado o teto, a tela mostra "não foi possível calcular agora", com a planta anterior se houver, e
  para de perguntar.

- **D17 — O frontend aceita antes de a API servir.** O frontend recusa a resposta inteira quando
  aparece uma chave desconhecida (`TRIP_DETAIL_OPTIONAL_KEYS` + `hasKeys` em
  `tripResponse.validation.ts`), e a tela de detalhe cai mesmo com a API respondendo 200. Por isso a
  T12a, que só **aceita** `cargoLayoutState` no detalhe e `{ layoutId, state }` na prévia, fica num
  commit próprio antes da T10. Na publicação são dois pushes: a T12a vai para o ar primeiro, e T10/T11
  só depois dela. Decisão do usuário, 2026-09-12.

- **D18 — Falha espera antes de reabrir.** O upsert só reabre uma linha `failed`, `queued` ou `running`
  quando o `updated_at` dela é mais velho que o lease da D14, cerca de 280 s. Sem essa espera, uma
  falha definitiva (entrada inválida, exceção do empacotador) seria reaberta a cada 3 s pelo polling e
  pelo gatilho lazy, e o empacotador rodaria em laço sem teto no servidor. Uma entrada editada gera hash
  novo e é calculada na hora. Dentro da espera, a resposta é `failed` com o código e a tela para de
  perguntar; quando o pedido é reaberto, a resposta é `pending`. O polling também reabre, pela mesma
  regra. Isso ajusta a D16: "a próxima mudança ou leitura reabre", só que depois da espera. Decisão do
  usuário, 2026-09-13.

- **D19 — A prévia não guarda dado pessoal além de um dia.** Linha de `trip_cargo_layouts` com
  `trip_id` nulo (prévia que não virou viagem) e `updated_at` com mais de 24 h é apagada pelo
  `apps/cron-transportada`. O `input` dela carrega o nome do cliente e o endereço das paradas
  (minimização, LGPD art. 6º). A prévia que virou viagem ganhou o `trip_id` e fica. Decisão do
  usuário, 2026-09-13.
- **D20 — A etiqueta servida é a de agora.** O hash ignora a etiqueta (D6), então uma planta `ready`
  pode ter sido desenhada com o rótulo, o cliente ou o número de nota antigos. Na leitura (detalhe,
  prévia e polling), a API reescreve as etiquetas do `layout` servido com as da entrada atual, sem
  recalcular nada. Consequência direta da D6 e da revisão final (M3).

- **D21 — Baú fechado segura a carga.** Na operação do usuário, caminhão de baú fechado (`body_type`
  `02`, fechada/baú) não precisa amarrar a carga, porque as paredes a contêm; carroceria aberta ou
  sider precisa. A planta passa a tratar `securesCargo` como verdadeiro quando o veículo é baú fechado,
  e só nos outros tipos vale a regra da spec 100 (todo motorista da viagem amarra). Isso vale também
  para a prévia sem motorista. Medido: a Atego 2426 cai de 377 para 46 caixas de fora e a Iveco Daily,
  de 24 para 0. Decisão do usuário, 2026-09-13.
- **D22 — Nenhuma mercadoria de fora do mapa 3D.** O usuário quer zerar as caixas `bedFull` quando a
  carga cabe fisicamente. Depois da D21, o que sobra (46 na Atego, nas entregas 1–7 e 15: escada da
  porta e alcance da primeira entrega) é medido e corrigido no empacotador, mostrando o risco físico de
  cada mudança antes de aplicar. Decisão do usuário, 2026-09-13.

- **D23 — Pilha alta precisa de encosto, mesmo em baú fechado.** Corrige a D21, que fazia baú fechado
  virar `securesCargo: true` e liberava pilha alta solta no meio do baú. Regra do usuário: pilha alta
  (acima de `STABLE_STACK_SLENDERNESS` × a menor base) precisa estar encostada no lado da cabeceira e
  em pelo menos uma lateral. Serve de encosto a parede do baú ou uma pilha vizinha que suba ao lado
  dela. O lado da porta não é exigido, e a pilha pode ficar colada na porta para preencher o espaço.
  A regra fica no empacotador como `enclosedBody: true`, que a API manda quando o veículo é baú fechado
  (`02`). `securesCargo` volta a ser só a regra da spec 100 (amarração pelos motoristas), e com carga
  amarrada a esbeltez continua livre. Carroceria aberta sem amarração segue exigindo os quatro lados.
  Decisão do usuário, 2026-09-13.

## Fora do escopo

- Regra física do empacotador — apoio de 80%, escora pelo lado, célula de 5 cm,
  `STABLE_STACK_SLENDERNESS` — não muda; esta spec move **onde** o pacote roda, não **como** ele
  decide.
- Peso por caixa no empacotador (`PlacementBox` sem massa) — spec própria, como já registrado em
  specs anteriores.
- As rotas de valuation (`GET /trips/:id/valuation`, `POST /trips/valuation-preview`) não mudam de
  comportamento; deixam de ser vítimas do bloqueio síncrono porque o bloqueio deixa de existir, mas
  nenhuma delas ganha lógica nova.
- Contagem/formulário de medição de caixa (`nfe-package-boxes`) e a fila da spec 085 não mudam; esta
  spec só passa a depender de dados que já existem lá.
- Promoção do pacote `@adatechnology/cargo-placement` de `rc` para uma versão estável é decisão do
  dono do outro repositório, fora do fechamento desta spec **[ASSUMIDO]**.
- Revalidação em massa de layouts já `ready` quando `policyVersion` muda: não há job de backfill;
  cada viagem/prévia só recalcula quando algo nela dispara o hash novo (eager) ou quando alguém lê e
  o hash não bate (lazy) **[ASSUMIDO]**.
- Notificação em tempo real (WebSocket/SSE) do status do layout: só há consulta por intervalo (D10);
  push fica para quando o produto pedir.
- Deploy, publicação do pacote e qualquer migration além das aditivas listadas em D5/D11 são decisão
  do usuário — ver `## Prompt de execução` em `tasks.md`.

## Critério de aceite

- **G001** Migration aditiva cria os três índices da D11 com esses nomes exatos; contrato de schema
  confere presença e forma; `EXPLAIN` sobre a consulta de `trip-occupancy.support.ts:446-456` mostra
  Index Scan em vez de Seq Scan, evidência em `evidence.md`.
- **G002** O app consome `@adatechnology/cargo-placement` (versão `rc`) no lugar do domínio local;
  testes finos de re-export confirmam a superfície esperada; nada do domínio de posicionamento
  permanece em `apps/api-transportada/src/trips/domain/`.
- **G003** Orçamento de tempo: contrato vermelho antes mostra caixa restante virando `unplaced` com
  motivo `time_budget` e o layout `ready` com `truncated: true` quando o `deadline` vence; erro/kill
  da thread vira `failed` com `CARGO_LAYOUT_TIME_BUDGET_EXCEEDED` / `CARGO_LAYOUT_FAILED`.
- **G004** `trip_cargo_layouts` existe com os campos, `CHECK`, FK composta e `unique` da D5; sem
  `pgEnum`; migration espelhada no schema do worker; contrato de schema cobre as constraints.
- **G005** `hashCargoLayoutInput`: estável sob mudança cosmética (label/clientName/noteNumbers);
  muda ao reordenar parada, trocar caixa, trocar baú, `loadingAccess`, `securesCargo` ou
  `policyVersion`.
- **G006** `request-cargo-layout.use-case.ts` faz upsert idempotente: pedido repetido com o mesmo
  hash enquanto o registro está `queued`/`running`/`ready` é no-op; todos os use cases eager da D7
  chamam-no na mesma transação da mudança.
- **G007** Gatilho lazy: `readTripDetail` recalcula o hash com o dado já carregado e enfileira em
  transação curta separada quando não bate; a leitura em si nunca fica mais lenta por causa disso
  (ver G012).
- **G008** Envelope, topologia e relay da D8: mensagem no formato do envelope existente; payload só
  `{ layoutId, inputHash }`; topologia principal/retry 30 s ×2/morta; prefetch 1; testes novos
  entram na lista explícita de `apps/worker-transportada/package.json`.
- **G009** Handler do worker: reivindicação atômica por hash; reivindicação nula ou hash superado →
  confirma e descarta; falha transitória → retry e depois `failed`; sucesso grava `ready` (ou
  `ready` truncado, D9); executa em thread com o budget.
- **G010** `readTripDetail` e a prévia devolvem o layout guardado conforme D10 (`ready`+hash igual,
  `stale`, ou estado sem layout); `cargoLayoutState` serializado; `GET
/trips/cargo-layouts/:layoutId` responde para polling; `bedDimensions === null` continua sem
  chamar o pacote.
- **G011** `test/trip-detail-query-count.integration.ts` (ou equivalente já existente) confirma que
  o número de consultas de `readTripDetail` não piora com a leitura do layout armazenado.
- **G012** Frontend: tipos e validação aceitam `cargoLayoutState` ausente (API antiga) e presente;
  `TripCargoLayers`/`TripDetail` mostram esqueleto + fantasma translúcido + selo enquanto pendente, e
  animam suavemente do layout antigo para o novo quando ele chega; sem mascote.
- **G013** Nenhuma regra física do empacotador (apoio 80%, escora, célula 5 cm, `STABLE_STACK_SLENDERNESS`)
  muda; contratos de placement existentes continuam verdes.
- **G014** ADR "a planta é do worker" (estende ADR-0044 §7), ponteiros em
  `docs/domain/cargo-placement-defects.md`, `apps/*/CLAUDE.md` e `docs/ai-context/api-transportada.md`
  refletindo a mudança.
- **G015** `bun run typecheck`, os contratos relevantes por app e `make check` verdes; nenhuma
  regressão nos contratos de placement das viagens reais.
