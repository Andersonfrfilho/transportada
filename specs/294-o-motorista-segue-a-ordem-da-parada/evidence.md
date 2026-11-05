# Evidência — 294

## T0.1 — ADR 0113 (2026-11-05)

- `git fetch && git ls-tree origin/staging docs/adr/` → maior número em `origin/staging` é 0112 (0109 não existe);
  **0113 livre**.
- Tabela de eventos confirmada em `apps/api-transportada/src/database/trip.schema.ts`: **`trip_stop_events`**
  (`tripStopEvents`, `kind ∈ {arrived, delivered, returned, occurrence, departed, departure_cancelled}`). Saída
  (`report-stop-departure.use-case.ts:123`), chegada (`report-stop-arrival.use-case.ts:119`) e baixa
  (`document-outcome-steps.service.ts:127`) gravam por `recordEvent` →
  `drizzle-driver-field-report.repository.ts:800` (`insert(tripStopEvents)`). A saída também marca
  `trip_stops.en_route_since` (`markStopEnRoute`). A baixa de campo não escreve em `trip_document_events`.
  `plan.md` atualizado.
- `grep -rn "trip_stop_location_suggestions\|address_correction_suggestions" src drizzle` → nada: a tabela da
  ADR-0080/195 nunca foi criada.
- `docs/adr/` não tem índice (`README`); a convenção é marcar a ADR antiga no cabeçalho. ADR-0080 ganhou
  "Substituída em parte por: ADR-0113".
- `npx prettier@3 --check` nos arquivos alterados → todos formatados.
- `grep -n "0113" docs/adr -r` → `0113-…md:1` e `0080-…md:6`.

## Desvio do plano — contratos vermelhos (T0.2, T0.3, T0.4)

Contrato vermelho registrado no `package.json` quebraria o gate por task. Cada task de contrato escreve o contrato
primeiro, roda vermelho (módulo ausente), e escreve na mesma task a política **pura** que o deixa verde, sem ligar
em use case (isso fica em T2.3/T3.1). T0.4 (contratos do bot) foi movida para o começo de T4.3.

## T0.2 — contrato e política da ordem da parada

- Contrato `apps/api-transportada/test/trips/stop-event-sequence.contract.ts`, importado por
  `test/trips.contract.test.ts` (já listado no `package.json`).
- Vermelho: `bun --env-file=../../.env.test test ./test/trips.contract.test.ts` → `Cannot find module
'../../src/trips/domain/stop-event-sequence.policy.js'` (0 pass, 1 fail, 1 error).
- Política `src/trips/domain/stop-event-sequence.policy.ts` (reusa `TripFieldChannel`).
- Verde: mesmo comando → 147 pass, 0 fail.
- Gates em `apps/api-transportada`: `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` → 13139 pass,
  35 skip, 0 fail; prettier nos arquivos alterados.

## T0.3 — contrato e política da correção do endereço pela chegada

- Contrato `apps/api-transportada/test/trips/address-arrival-correction.contract.ts`, importado por
  `test/trips.contract.test.ts`.
- Vermelho: `bun --env-file=../../.env.test test ./test/trips.contract.test.ts` → `Cannot find module
'../../src/trips/domain/address-arrival-correction.constant.js'` (0 pass, 1 fail, 1 error).
- Política `src/trips/domain/address-arrival-correction.policy.ts` + `.constant.ts` (2000 / 15000 / 300 m);
  distância por `distanceInMetres` de `src/addresses/domain/coordinate-distance.ts` (haversine existente).
- Fronteira: a grade de 7 casas decimais não cai em exatamente N m, então o contrato acha o último ponto com
  distância <= limite (apply/ignore) e o seguinte, > limite (suggest).
- Verde: mesmo comando → 166 pass, 0 fail.
- Gates em `apps/api-transportada`: `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` → 13158 pass,
  35 skip, 0 fail; prettier nos arquivos alterados.

## T1.1 — painel tolerante a `recordedTogether` e à origem da correção do endereço

- Contrato `apps/frontend-transportada/test/trip/timeline-recorded-together-tolerance.contract.ts`, importado por
  `test/trip.contract.test.ts` (já na lista do `package.json`): campo ausente, `true`, `false`, não booleano
  (recusa), origem `driver`, origem desconhecida (rótulo neutro), kind desconhecido (descartado).
- Vermelho: antes da implementação o chip `together` e a origem livre não existiam (falha de tipo/asserção).
- `recordedTogether?: boolean` opcional no item (`TRIP_TIMELINE_ITEM_OPTIONAL_KEYS`); chip "Marcada junto" com
  dica; `addressChange.origin` passou a texto livre na leitura, origem fora do vocabulário cai em
  `origin.unknown`; `origin.driver` = "Endereço corrigido pela chegada do motorista".
- Ajuste: `timeline.contract.ts` deixou de exigir recusa de origem `invented` (decisão da 294: tolerar).
- Gates em `apps/frontend-transportada`: `bun run typecheck` limpo; `bun run lint` 0 errors (16 warnings
  antigos); `bun run test` → 8632 pass, 0 fail + 1438 pass, 0 fail; `bun run build` ok; prettier nos alterados.

## T2.1 — migration A aditiva (`recorded_together`, `address_correction_suggestions`, fonte `driver`)

- Migration `20261105023931_stop_event_recorded_together_and_address_suggestions` (com `rollback.sql`): coluna
  `trip_stop_events.recorded_together boolean not null default false`; tabela `address_correction_suggestions`
  (`company_id`, FK de membership, índice `(company_id, status, created_at)`, único parcial
  `(company_id, trip_stop_event_id)`); `'driver'` entra em `GEOCODING_SOURCES` e os quatro CHECKs de fonte
  (`geocoded_addresses`, `geocoded_address_corrections` previous/new, `client_delivery_addresses`) são alargados
  aditivamente. `origin = 'driver'` já existia em `CORRECTION_ORIGINS`.
- `db:generate` seguinte: `no_changes`. Sem rebase: `origin/staging` já era ancestral da branch.
- Ajustes de contrato: lista de migrations (`static-migration.contract.ts`), política do staging-refresh
  (`deploy/staging-refresh/prune-source.sql`: `keep`), e o teste "origem não é fonte" admite a sobreposição `driver`.
- Gates: `make migration-test` → 231 pass, 0 fail (migration + rollback); `bun run typecheck` e `bun run lint` limpos;
  prettier ok; contrato da API → só falham os 9 testes de `toll booth catalog repository`, que falham igual sem a
  mudança (preexistente, `disposable-database` "drop" no ambiente local).

## T2.2 — passos de saída e chegada extraídos (sem mudança de comportamento)

- Novos: `stop-event-steps.service.ts` (`performStopDeparture`, `applyStopDeparture`, `performStopArrival`,
  `applyStopArrival`; `assertArrivalWithinWindow` e `shiftPendingStopsByDelay` privados) e
  `stop-event-steps.types.ts`. Os use cases mantêm `deriveFieldAuthorship`, `unitOfWork.execute`, `withFieldReport`
  e `recall`; o `perform` só chama o passo. Diff dos use cases = só remoção do código movido.
- Gates (de `apps/api-transportada`): `bun run typecheck` limpo; `bun run lint` limpo; prettier ok;
  contrato `bun --env-file=../../.env.test test --timeout 120000` → 13158 pass, 26 skip, 9 fail (só os 9 de
  `toll booth catalog repository`, preexistentes); integração `bun --env-file=../../.env.test run test:integration`
  → 1857 pass, 8 skip, 0 fail (332 arquivos, 3586 s).
- Infra: `make e2e-up` falha no pull do MinIO (GHCR `unauthorized`); subiu-se só `postgres rabbitmq`
  (`ENV_FILE=.env.test SERVICES="postgres rabbitmq" make up`), como a CI faz.

## T2.3 — a API exige a ordem da parada da tripulação e marca junto a etapa pulada

- Novo `recorded-together-steps.service.ts`: `recordSkippedSteps` (trava as paradas, lê a decisão sob a trava, aplica
  `resolveStopEventSequence`, grava a saída marcada junto — `markTripOnDeliveryRoute` + `recordEvent` com
  `recordedTogether`, sem `isDepartureTapStale`, sem 409, sem `markStopEnRoute` — e a chegada marcada junto por
  `applyStopArrival`, que zera "a caminho" da viagem e não desloca a previsão) e `performSequencedStopArrival`
  (escritório inalterado, `recordedTogether: []`). Relógio das etapas junto = o do evento pedido; `location: null`
  nelas (decisão reversível: não dispara a correção de endereço, RF14).
- Baixa (`document-outcome*.ts`): trava das paradas em todo canal e nota relida sob a trava (a baixa do motorista e a do
  escritório na mesma nota se serializam: antes da releitura as duas gravavam `delivered`), transição calculada antes das
  etapas (cancelada continua `TripStateTransitionNotAllowed`; `unchanged` não marca nada).
- Reenvio: `findRecordedTogetherSteps` deriva `recordedTogether` das etapas da mesma parada com o mesmo `created_at`
  do evento da chave (mesma transação). `recordEvent` aceita `recordedTogether`.
- HTTP: chegada do motorista devolve `{ id, recordedTogether }`; baixa/devolução já devolvem o resultado inteiro.
  Escritório sem mudança de corpo.
- Efeito colateral aceito: chegada sem saída leva a viagem `dispatched` → `on_delivery_route` (como a saída real faria),
  não mais a `in_transit`; três testes antigos (`me-trip` x2, `event-location-stamp`) ajustados a isso e à contagem de
  eventos.
- Testes: `test/integration/stop-event-sequence.integration.ts` (9: baixa 3 eventos/2 junto, chegada sem saída, parada já
  chegada, escritório 1 evento, reenvio de baixa e de chegada, cancelada, corrida motorista × escritório, ajudante) e contrato
  de rota (`clock-fields-schema.contract.ts`).

## T2.4 — estatísticas ignoram etapa marcada junto; linha do tempo desempata

- Espera (spec 232): `readStopDwells` e `readStopDwellsByTrip` juntam só eventos com `recorded_together = false`. Amostras de
  tempo de serviço (`service-time.policy.ts`) e de deslocamento (206 D11) não têm consumidor de `trip_stop_events` hoje: nada a filtrar.
- Previsão 109: T2.3 já pulava `shiftPendingStopsByDelay` com `recordedTogether`; agora há integração (parada pendente intacta).
- Desempate: `stop.departed` passou a prioridade -1 (< `stop.arrived` 0 < `document.delivered` 4); a lista decrescente mostra
  baixa, chegada, saída. Painel: `sortChronologically` do mapa desempata saída < chegada < resto.
- Integração `stop-event-sequence` (10 pass), `trip-timeline` (46), `trip-valuation-document-figures` (7); contrato 13168/0; painel 1438/0;
  typecheck e lint verdes.

## T2.5 — a baixa que fecha a parada devolve a próxima; o snapshot leva a precisão

- `resolveDepartureStop` e o resto da política foram movidos para `trips/domain/driver-stop-resolution.policy.ts` (imports do bot atualizados);
  `isStopAddressReliable` (`stop-address-reliability.policy.ts`): confiável só com coordenada e `rooftop`/`street`.
- `reportDocumentDelivery`/`reportDocumentReturn` devolvem `nextStop` (id, sequence, totalStops, recipientName, address, documents,
  coordinate, precision, isAddressReliable) quando a baixa do motorista/WhatsApp fecha a parada e a viagem segue; `null` na última parada,
  na nota que não fecha a parada, no reenvio e no escritório (`serializeOutcome` não o inclui). Leitura: 2 consultas por baixa que fecha parada
  (paradas+geocode, notas+destinatário), sem N+1.
- `GET /me/trips/current`: cada parada ganhou `precision` e `isAddressReliable` (mesmo join de `geocoded_addresses`); a contagem de consultas
  da leitura não mudou (25). O app do motorista valida à mão e ignora campos novos: sem mudança.
- Contratos `stop-address-reliability`, `resolve-next-stop`; integração `next-stop-offer` (7). Contrato 13174/0, integração dos arquivos tocados 50/0,
  typecheck e lint verdes.

## T3.1 — a chegada da tripulação corrige o endereço ou sugere ao escritório

- `PerformSequencedStopArrival` chama `correctAddressFromArrival` (porta da transação de campo) após gravar a chegada, só para
  motorista/ajudante com localização real; escritório e etapa marcada junto (localização nula) nunca chamam.
- `arrival-address-correction.support.ts`: lê o endereço da parada + `geocoded_addresses`, roda `resolveAddressArrivalCorrection` e
  `apply` → `applyGeocodedAddressCorrection` (extraída do repositório do `PATCH /geocoded-addresses/:key`, agora com `origin`/`source`
  opcionais; a trilha `geocoded_address_corrections` com `origin 'driver'` já é o evento da linha do tempo 228), `suggest` → insere
  `address_correction_suggestions` (`on conflict do nothing`, único por empresa + evento), `ignore` → nada.
- Roda em savepoint dentro da transação da chegada: falha vira `address_correction.failed` (warn, só ids) e a chegada grava. Logs
  `address_correction.applied|suggested|ignored|failed` sem coordenada. Chave `address-correction:<eventId>` vai no log; a idempotência real é o
  `recall` da chave da chegada + o índice único da sugestão.
- A FK `address_key` -> `geocoded_addresses` da sugestão foi removida da migration da T2.1 (branch não publicada): endereço sem coordenada não tem linha lá.
- Testes: integração `address-arrival-correction` (11: CEP 500 m aplica com trilha e evento driver, CEP 5 km sugere, confiável 200 m nada, confiável
  500 m sugere sem sobrescrever, sem coordenada sugere sem distância, sem localização, escritório, marcada junto, reenvio, chegada repetida, falha isolada)
  e contrato `arrival-address-correction-call`. Contrato 13177/0, integração dos arquivos tocados 28/0, typecheck, lint e prettier verdes.

## T3.2 — sugestões de endereço do motorista nas pendências

- `GET /pending-items` ganhou a fonte `addressSuggestedByDriver` (`trip.manage`, a permissão do `PATCH /geocoded-addresses/:addressKey`), só
  pendentes da empresa do token, com `details` (endereço, ponto sugerido, distância, parada). Com mais de uma fonte permitida o caso de uso
  mescla pelo cursor `createdAt::id` decrescente; com uma só a paginação segue a dela (itens passaram a levar `createdAt`, que a resposta HTTP não expõe).
  A rota continua `fleet.read`: quem só tem `trip.manage` precisa de `fleet.read` para abrir a lista.
- `POST /address-correction-suggestions/:suggestionId/apply|dismiss` (`trip.manage`): aplicar é `applyGeocodedAddressCorrection` com o ponto
  sugerido, `origin 'operator'`, `source 'manual'`, ator = o operador (a trilha vira o evento 228); descartar só marca. Ambas travam a linha
  (`for update`), gravam `decided_by/decided_at` e uma linha em `audit_logs` (`address_correction_suggestion.applied|dismissed`) na mesma transação.
  Outra empresa ou inexistente: 404; já decidida: 409.
- Testes: contratos `pending-items` (mescla, permissão por fonte, filtro de empresa/pendente, rotas 200/404/403/rota não-UUID) e integração
  `address-suggestion-pending-items` (5: lista por empresa, aplicar com trilha e auditoria, descartar, tenant 404 nas duas decisões, 409 sem segunda
  gravação). Contrato 13185/0, integração dos arquivos tocados 6/0, typecheck, lint e prettier verdes.

## T3.3 — a API confere a ordem da parada e o canhoto repetido (RF25–RF27)

- Ordem: `resolveStopOrderViolation` (política pura, só tripulação) lê `findNextStopCandidates` sob a trava das paradas (`assertStopInOrder`). Fora de ordem
  = baixa/chegada/devolução de parada que não é a a caminho/chegada-e-aberta (quando existe uma), ou saída para outra que não a próxima pendente
  (`findNextPendingStop`, a mesma escolha do "saí"). `409 TRIP_STOP_OUT_OF_ORDER` com `{ error, outOfOrder: { requestedStopId, requestedSequence,
currentStopId|null, currentSequence|null, nextStopId|null, nextSequence|null } }` (`ApiError.extraBody`, não enumerável quando ausente). `confirmOutOfOrder: true`
  no corpo de saída, chegada, entrega e devolução (`/me`) grava, com as regras de marcar junto. Reenvio (chave de idempotência) nunca dá 409; parada já fechada,
  já chegada ou nota já baixada também não. Saída com OUTRA parada a caminho continua `TRIP_HAS_STOP_EN_ROUTE` (precede a conferência). Escritório (`target`) nunca é conferido.
- Canhoto (`photo`) em todo canal: SHA-256 dos bytes; mesma imagem já anexada na empresa -> nada grava e a resposta é 200 `{ data: { duplicate: { documentId,
attachedAt }, id, processingState, punctuality } }` (id do comprovante existente, para o app antigo seguir sem erro) no `/me` e `{ data: { duplicate } }` no
  `field-proof` do escritório. Canhoto diferente sobre um que a nota já tem: tripulação `409 TRIP_CANHOTO_ALREADY_ATTACHED` sem `replaceCanhoto` (campo multipart);
  sem canhoto na nota (spec 223) entra sem pergunta. Foto da carga nunca confere.
- O hash já era gravado em `stored_objects.sha256` (por empresa): não há coluna nova, só o índice parcial `stored_objects_company_sha256_delivery_proof_idx`
  (migration aditiva `20261105120144_canhoto_hash_index`, rollback incluso).
- Escritório: a regra da T15 M1 foi mantida (troca o próprio canhoto; canhoto da tripulação continua `409 TRIP_DELIVERY_PROOF_ALREADY_CAPTURED`). Na baixa do
  escritório com canhoto junto, imagem repetida não grava o canhoto e a baixa segue com `proofPending` (sem campo de duplicado na resposta da baixa).
- WhatsApp: `classifyWhatsAppDriverEventError` ganhou `stop_out_of_order` e o bot responde um texto simples (sem 1/2; vem na T4.10). O envio do canhoto pela entrega
  em preparo usa o mesmo `attachDeliveryProof`: canhoto repetido não grava e a preparação não trata o `duplicate` ainda (T4.x).
- App do motorista: o multipart do canhoto (`photo`) sempre manda `replaceCanhoto=true` (o "Substituir" da tela é a confirmação) até a T5.4; saída/chegada/baixa não
  mandam `confirmOutOfOrder` ainda (T5.4) — um 409 fora de ordem cai no caminho genérico de recusa da fila, sem quebrar.
- Testes: contratos `stop-order` (política, corpo do 409 e parse das rotas, anexo com doubles, recusa do WhatsApp; 15) e integração `stop-order-guard` (10: em ordem
  intacto, saída fora de ordem 409 e confirmada, baixa/chegada fora de ordem, reenvio, escritório sem pergunta, sem canhoto, mesma imagem, canhoto diferente
  409/replace, escritório troca e duplicado). Contrato 13200/0, migrations, integração dos arquivos tocados, typecheck, lint, prettier; app do motorista 2197/0.

## T4.1 — cliente nas listas de escolha do bot (RF17)

- `describeStopReference` (grupo e individual) e `GROUP_DELIVERY_TEXT.askDocument` passam a citar a nota e o
  cliente ("NF 17234 · Padaria Sol", "e mais N" para as outras notas da parada); sem nome, só a nota como antes.
  O candidato de parada e o documento do grupo carregam `recipientName` (vem de `recipientDisplayName` da viagem).
  Saíram das docstrings as sentenças "nada de nome de cliente"; a regra de não logar PII segue intacta.
- Contratos: `driver-events.contract.ts` (política), `group-stop-flow.contract.ts` (lista do saí/cheguei),
  `group-delivery-flow.contract.ts` (lista do entreguei).
- Gates: typecheck e lint limpos; contrato da API → 13168 pass, 26 skip, 0 fail; prettier ok.

## T4.5 (grupo) — quem mandou decide a regra; atendente baixa pelo escritório (RF18–RF20)

- `createWhatsAppSenderRoleResolver` (tripulação × atendente × desconhecido): tripulação = telefone de motorista/ajudante
  da frota (`isCrewPhone`, extraído do adaptador da ocorrência); atendente = `resolveWhatsAppActor` (spec 144) com a
  permissão `trip.report-on-behalf`, a mesma da rota `field-delivery` (nenhuma permissão nova). Tripulação vence quando o
  número é das duas coisas. Desconhecido: "Só a tripulação ou um atendente cadastrado registra a entrega." e nada é gravado.
- RF20: a entrega em preparo do grupo deixou de gravar sempre no motorista dono do grupo: o ator vem do remetente.
  Atendente = `{ actorUserId: usuário, driverId: motorista da viagem, attendant: true }`; a foto/localização dele também é
  admitida (`isGroupDriver` aceita atendente) e a baixa/anexo vão pelas MESMAS funções do escritório
  (`reportDocumentDelivery` com alvo `trip` resolvido, `reportFieldProof`), autoria `office`, auditoria
  `trip_field_office.document_*` com origem `whatsapp`. Janela de horário informado: a da própria função (hora = agora).
- RF19: comprovantes opcionais para o atendente: `required` vira `optional` em foto, mercadoria, quem recebeu e nome;
  assinatura é ignorada (não existe no escritório). Sem canhoto, a baixa segue "conclui sem canhoto e cobra depois" (223).
  Anexo recusado pela configuração do escritório cai no aviso "não consegui anexar" já existente.
- Contratos: `test/whatsapp/group-sender-role.contract.ts` (papéis, permissão, fluxo do grupo por remetente, função do
  escritório), `delivery-preparation.contract.ts` (tripulação não pula obrigatório; atendente pula tudo e a baixa leva
  `attendant: true`).
- Pendente: conversa individual (menu do operador, spec 144 — grafo publicado) para "dar baixa" do atendente.

## T4.6 (grupo) — várias notas e encerrar a rota pelo atendente (RF21)

- "entreguei 17234 17235": só o atendente (até 8 notas); baixa pelo escritório sem prova, resumo por situação (registrada,
  canhoto pendente, já baixada, não encontrada, falhou). Tripulação segue "uma nota por vez".
- "encerrar a rota/viagem": só o atendente; confirmação "1 - Sim / 2 - Não" com quantas notas seguem abertas; chama
  `trips.close` (a função de `POST /trips/:id/close`) pela ponte `whatsappTripCloseBridge`, com o contexto do atendente,
  motivo fixo e auditoria `whatsapp`. Quem confirma também precisa ser atendente. Mais de uma viagem ativa: manda ao painel.
- Contrato: `test/whatsapp/group-attendant-close.contract.ts`.
- Pendente: conversa individual (viagem pelo número da nota ou pela lista de viagens na rua).
- Gates: typecheck e lint limpos; contrato da API sem falhas; prettier ok. Integração não rodada (outro worktree usava o
  Postgres de teste).

## T4.5/T4.6 (conversa individual) — o atendente direto com o bot (RF18, RF19, RF21)

- Ramo novo no grafo raiz (`buildAttendantFieldFlowNodes`): `attendant_field_command`, lista de viagens na rua
  (`attendant_trip_entry/router`) e confirmação `✅ 1 - Sim / ❌ 2 - Não` (`attendant_close_menu/router`). O despachante
  (`runAttendantFieldCommand`) leva o texto "entreguei 17234 17235" / "encerrar a rota [NF]" ao nó, só para quem tem
  `trip.report-on-behalf` e não é motorista cadastrado (motorista segue as regras de motorista). Grafo publicado antes
  da 294 não tem o nó e segue como antes até a republicação: **publicar o grafo** (`scripts/whatsapp-flow-publish.ts`) no
  deploy, sob aprovação — não foi publicado em staging nem produção.
- Baixa: acha as notas (NF) nas viagens na rua, mesmo de viagens diferentes, e baixa pela função do escritório
  (`deliverByDocument`, motorista efetivo da viagem, autoria `office`, ator = usuário do atendente). Sem prova, "conclui sem
  canhoto e cobra depois". Resumo por situação.
- Encerrar: viagem pela NF ou pela lista das viagens na rua (várias viagens valem aqui); a mesma função de
  `POST /trips/:id/close` pela ponte; confirmação diz quantas notas seguem abertas.
- Contagem de notas abertas (grupo e individual): `countOpenTripDocumentsForClose` (`trip-close.policy.ts`), a regra do
  servidor — nota liberada não conta. No grupo continua uma viagem ativa por motorista.
- Contratos: `test/whatsapp-commands/attendant-field-actions.contract.ts` (comando, lote, encerrar por NF/lista/uma só,
  confirmação, falha, nós do grafo) e `group-attendant-close.contract.ts` (contagem pela regra do servidor).
- Gates: typecheck e lint limpos; contrato da API sem falhas; prettier ok. Integração: não rodada (suíte completa em
  execução no worktree spec-294).

## T4.2 — "marquei junto" nas respostas do bot (RF5)

- Resultado do evento (`WhatsAppDriverEventResult.registered`) ganha `recordedTogether` (lido do retorno de `reportArrival`
  e da baixa); `BotSpeechLine` ganha `after` (linhas depois da fala principal, resolvidas em `say` e `renderBotSpeechLine`).
  `describeRecordedTogether` produz "Marquei a chegada junto com a entrega da NF 17234." (saí+cheguei: "a saída e a chegada").
  Grupo e individual falam a mesma frase; o "cheguei" cita a primeira nota da parada. Sem etapa marcada junto, a resposta é a de sempre.
- Contrato: `test/whatsapp-commands/recorded-together-speech.contract.ts` (frase, resultado, grupo e individual).
- Gates: typecheck e lint limpos; contrato da API 13273 pass / 26 skip / 0 fail; integração (flow-actions, command-driver,
  group-occurrence-adapter) 10 pass; prettier ok.

## T4.3 (+ T0.4) — a próxima rota, grupo e individual (RF8–RF10, RF12, RNF1)

- A baixa que fecha a parada devolve `nextStop`/`tripCompleted` ao bot (`details` do resultado e `routeContinuation` da
  resposta da entrega em preparo). Texto único em `whatsapp-driver-route-offer.policy.ts` (parada N de M, cliente, endereço,
  notas, mapa pela coordenada do cadastro, aviso do RF12) e escolha em `whatsapp-driver-choice.policy.ts` ("1"/"2"/"um"/"dois"/
  "sim"/"não"/"pular", só fala curta).
- Grupo: o mesmo pedido segue no passo `route.offer`; "1" chama `departStop` do fluxo das paradas (o registro do "saí", chave
  `whatsapp-group-request:<pedido>`), "2" encerra com "Quando for, mande *saí*." e a despedida do #531 sai do pedido. Última
  parada: "Rota concluída, todas as paradas fechadas." e o pedido fecha.
- Individual: o pedido mora no contexto da sessão (`driverPrompt`: só `stopId`, número da nota e hora; vale 2 h) e é respondido no
  despachante antes do grafo (`acceptDriverPrompt`), depois da entrega em preparo e do áudio. Outra mensagem encerra o pedido e
  segue o fluxo. "1" usa `departWhatsAppDriverStop` com chave `whatsapp-route-offer:<parada>:<hora da oferta>`. O "devolvi" do grafo
  (`returnReasonRouter`) também oferece. **Não muda o grafo versionado**: nada a republicar para esta task.
- RNF1: `canAskRouteOffer` (coleta aberta, escolha de parada, áudio pendente, outro pedido) é a única regra; bloqueada, a frase sai
  sem pergunta e nada é gravado.
- Contratos: `test/whatsapp-commands/route-offer.contract.ts` (texto, fala, individual, matriz, áudio) e
  `test/whatsapp/group-route-offer.contract.ts` (grupo, matriz, áudio pendente pelo `evolution-group-inbound`).
- Gates: typecheck e lint limpos; contrato da API 13323 pass / 26 skip / 0 fail; integração (flow-actions, command-driver,
  preparation-repository, group-request-repository) 17 pass; prettier ok.

## T4.9 — localização opcional no "Iniciar rota" e no "Cheguei" pelo bot (RF24)

- Antes de registrar saí/cheguei (e a saída da oferta da próxima rota), o bot pergunta "📍 Mande sua localização pelo clipe, ou
  responda _pular_" quando não há ponto recente. O ponto compartilhado antes vale sem perguntar (`WhatsAppSharedLocationStore.has`,
  que não consome). "pular", "pula", "não" ou "2", digitados ou falados, registram sem ponto; a localização compartilhada registra
  com ele. Outra resposta repete que o item vai por localização; no grupo, 3 respostas fora abandonam o pedido (regra do pedido), na
  conversa individual o pedido some na 3ª (`DRIVER_PROMPT_MAX_ATTEMPTS`) sem registrar, e outro comando ("saí", "entreguei 17234")
  tira o pedido de cena.
- Grupo: passo `stop.location` do pedido aberto; `locationReceived` do fluxo (agora assíncrono) registra com o ponto lembrado pela
  entrada de provas (`rememberLocation` vem antes de `advanceRequest`). Individual: pedido `location` no contexto da sessão, respondido
  no despachante (`acceptDriverPrompt` para texto, `answerLocationPrompt` para a mensagem de localização, antes de lembrar o ponto).
  Portas opcionais (`hasLocation`, `sharedLocations`, `driverPrompts`): ausentes, o comportamento é o de antes.
- Contratos: `test/whatsapp-commands/stop-location-prompt.contract.ts` e `test/whatsapp/group-stop-location.contract.ts`.
- Gates: typecheck e lint limpos; contrato da API 13346 pass / 26 skip / 0 fail; integração (flow-actions, command-driver,
  group-occurrence-adapter) verde; prettier ok. Grafo versionado não mudou.

## T4.4 — "Cheguei" em parada sem localização certa corrige o endereço (RF14)

- API: o resultado da chegada da tripulação (`SequencedStopArrivalResult`) passa a expor `addressCorrection`
  (`applied` | `suggested` | `ignored` | `failed`, vindo de `correctAddressFromArrival`, que antes devolvia `void`); ausente sem ponto.
  A rota HTTP não o devolve ao app (T5.2 decide); falha continua contida na chegada.
- Bot: `WhatsAppDriverEventResult.registered` leva `addressCorrection` (só `applied`/`suggested`); a fala acrescenta "Endereço atualizado. ✅" ou
  "Enviei para o escritório conferir o endereço. 📬", nos dois canais. `WhatsAppStopCandidate.isAddressReliable` (opcional) chega ao bot pelo
  snapshot da viagem; o "cheguei" numa parada não confiável pede a localização com "Este endereço está sem localização certa no mapa. Mande sua
  localização pelo clipe que eu atualizo o endereço, ou responda _pular_". Com ponto compartilhado antes, não pergunta e a chegada já leva o ponto.
- Contratos: `arrival-address-correction-call.contract.ts` (resultado, falha contida, sem cadastro), `recorded-together-speech.contract.ts`
  (resultado do bot), `stop-location-prompt.contract.ts` e `group-stop-location.contract.ts` (pedido e resposta, grupo e individual).
- Gates: typecheck e lint limpos; contrato da API 13363 pass / 26 skip / 0 fail; integração (`address-arrival-correction`,
  `stop-order-guard`) 21 pass; prettier ok. Grafo versionado não mudou.

## T4.10 — conferência de fora de ordem pelo bot (RF25)

- A recusa `stop_out_of_order` carrega os ids das paradas (`currentStopId`, `nextStopId`, `requestedStopId`) e os eventos
  (`reportArrival`/`reportDeparture`/`reportDelivery`, camada de eventos) aceitam `confirmOutOfOrder`. A pergunta mora em
  `whatsapp-driver-order.policy.ts`: "⚠️ Você iniciou a rota para a parada 3 (NF … — cliente), mas esta nota é da parada 5 (NF … — cliente).
  *1* - Entreguei a parada 5 mesmo / *2* - Foi engano, descartar" (chegada: "Cheguei na parada 5 mesmo / Foi engano"); saída que não é a
  próxima: "A próxima no roteiro é a parada 4 (…). Quer mesmo iniciar a parada 6? *1* - Sim, a 6 / *2* - Não, a 4".
- "1" reenvia a mesma etapa com `confirmOutOfOrder: true`. "2": descarta (entrega, chegada) ou, na saída, **registra a saída da próxima do
  roteiro** (a leitura do rótulo "Não, a 4"; sem confirmar a 6). Resposta falada ("um", "dois", "sim", "não", "foi engano") vale; outra
  resposta repete a pergunta (grupo, 3 tentativas) ou tira o pedido de cena (individual).
- Entrega: a preparação (`awaiting = 'out_of_order'`, coluna de texto livre, sem migration) fica aberta com as provas e responde ao 1/2 —
  vale para grupo e individual. Saída/chegada: grupo no passo `stop.confirm_order`; individual no pedido `out_of_order` do contexto
  (`WhatsAppDriverPrompts.recordStop`, também usado pelo "saí"/"cheguei" do grafo, pela oferta da próxima rota e pelo pedido de localização).
- Atendente: a baixa dele vai pelo caminho do escritório (T4.5), que não passa pela ordem, então não recebe a pergunta.
  Lacuna fechada na correção de RF19 (abaixo): o atendente no grupo também segue o escritório no "saí"/"cheguei".
- Contratos: `test/whatsapp-commands/out-of-order-prompt.contract.ts` (texto, individual, preparação) e
  `test/whatsapp/group-out-of-order.contract.ts` (grupo e adaptador); `test/stop-order/whatsapp-refusal.contract.ts` ajustado para os ids.
- Gates: typecheck e lint limpos; contrato da API 13398 pass / 26 skip / 0 fail; integração (flow-actions, command-driver,
  preparation-repository, stop-order-guard) 22 pass; prettier ok. Grafo versionado não mudou.

## T4.11 — canhoto repetido pelo bot (RF26)

- Mesma imagem (hash do conteúdo): a preparação confere ao receber a foto (`findCanhotoByHash`, o repositório do app) e responde "Esse canhoto
  já tinha chegado: NF 17234, entregue às 11:32." (hora de Brasília; a nota vem da própria preparação ou da viagem do motorista; sem número
  conhecido, só "…já tinha chegado, entregue às HH:MM."). Nada é guardado: o objeto sai do bucket e a preparação segue pedindo o que faltava.
- Outra foto de nota que já tem canhoto: a baixa passa, o anexo recebe `TRIP_CANHOTO_ALREADY_ATTACHED` e a preparação fica aberta
  (`awaiting = 'replace_canhoto'`) com "*1* - Trocar o canhoto (vai para conferência do escritório) / *2* - Descartar". "1" (também "um",
  "sim", "trocar") reenvia o anexo com `replaceCanhoto: true`; "2" (também "dois", "descartar") fecha como cancelada e mantém o canhoto.
- Nota entregue sem canhoto: a API já anexa a foto como o canhoto que faltava; o bot não diz nada a mais.
- Vale para grupo e individual (mesma preparação). Atendente segue pelo escritório (sem anexo do app).
- Contrato: `test/whatsapp-commands/canhoto-duplicate-prompt.contract.ts`.
- Gates: typecheck e lint limpos; contrato da API 13413 pass / 26 skip / 0 fail; integração (preparation-repository, flow-actions,
  command-driver) 12 pass; prettier ok. Grafo versionado não mudou.

## T4.7 — áudio em todo passo novo (RF22)

- Grupo: a resposta curta sem número ("um", "dois", "sim", "não", "pular", "agora não", "foi engano", "descartar", "trocar") vai direto ao
  passo do pedido aberto (caminho `botAudioQuickAnswer` que já existia); frase longa e número (a nota falada) passam pelo "Entendi assim".
  `interpretDriverChoice` só aceita fala curta com palavras do vocabulário: "não entendi a palavra sim" não responde.
- Individual: todo áudio passa pelo "Entendi assim"; confirmado, o texto falado responde ao pedido em aberto (oferta da rota, localização,
  fora de ordem) e à preparação (confirmação, fora de ordem, troca do canhoto).
- Mídia: pediu foto ou localização e chegou áudio → `repeatMediaRequest` da preparação repete o pedido com "Esse item vai por foto: tire a foto e
  envie aqui…" / "Esse item vai por localização…" e o que falta (grupo: `not_understood` com o motivo; individual: só quando o texto veio de
  áudio confirmado, `WhatsAppCommandTurn.isFromAudio`, senão o texto digitado segue o fluxo). "pular" falado vale quando o item é opcional;
  o pedido de localização do saí/cheguei repete "Esse item vai por localização…" em qualquer fala que não seja "pular".
- Contratos: `test/whatsapp/audio-new-steps.contract.ts` (entrada do grupo, cada passo, mídia) e
  `test/whatsapp-commands/audio-new-steps.contract.ts` (individual com o áudio real, mídia).
- Gates: typecheck e lint limpos; contrato da API 13456 pass / 26 skip / 0 fail (0 falhas, nenhuma das 9 conhecidas do pedágio apareceu);
  integração (flow-actions, command-driver, preparation-repository, group-request-repository, group-occurrence-adapter) 18 pass; prettier ok.
- **Grafo versionado (`whatsapp-flow-graph.constant.ts`) não mudou em nenhuma task desta leva**: a conversa individual usa o pedido no
  contexto da sessão e o despachante, sem nó novo. Não há `producao-publicar-falas-do-bot.sh` a rodar por causa das T4.2–T4.11.

## Correção RF19 — saí e cheguei do atendente pelo caminho do escritório

- Grupo: `createGroupStopFlow` resolve o papel do remetente (`resolveSenderRole`); atendente registra direto, sem pergunta de
  localização, e `record` leva `attendant: { actorUserId }`. O adaptador (`createGroupStopPorts`, `officeStopEvents`) chama
  `reportStopArrival`/`reportStopDeparture` com `target` resolvido (`createWhatsAppOfficeStopEvents`): autoria `office`, ator = atendente,
  em nome do motorista da viagem, sem ordem da parada e sem etapa marcada junto. Chegada leva a trilha `trip_field_office.stop_arrive`
  (origem `whatsapp`); a saída do escritório não tem trilha própria (a função não a aceita).
- Conversa individual: o atendente que não é motorista não chega ao "saí"/"cheguei" do motorista, e quem é motorista e atendente é tripulação
  (a tripulação vence); nada a mudar ali.
- Leitura da T4.10 mantida: na saída fora de ordem, "2 - Não, a 4" registra a saída da parada 4.
- Contrato: `test/whatsapp/group-attendant-stop.contract.ts`. Gates: typecheck e lint limpos; contrato da API 13463 pass / 26 skip / 0 fail.

## T5.1 — "Vamos marcar Cheguei junto" e o aviso pós-baixa no app (RF5, RF6)

- `listStepsToRecordTogether` (`recordedTogether.service.ts`) espelha a política da API só para avisar antes do toque; a API decide.
  O cartão da parada mostra "Vamos marcar Cheguei junto com esta baixa." (e "Iniciar rota e Cheguei", se a saída faltar) quando o
  "Não entreguei" está aberto sem chegada e dentro da confirmação do "Registrar entrega depois" (RF6: o aviso do placar continua ali,
  junto das etapas). O "Entreguei" segue liberado só pela chegada ou pelo registro tardio, como na 205.
- `client.send` passou a devolver a resposta do toque (`parseFieldReportResponse`: `recordedTogether`, lista vazia na API antiga); a drenagem
  junta os avisos (`fieldReportNotice.service.ts`) e a tela mostra "Marcamos Cheguei junto com esta baixa." com "Entendi".
- Contrato: `test/driver-trip/recorded-together.contract.ts` (tabela de etapas, frases pt/en, resposta, cliente, avisos).
- Gates: typecheck e lint limpos; `bun run test` 2212 pass / 0 fail; build ok.

## T5.2 — card da próxima parada e endereço sem localização certa no app (RF11, RF12, RF14)

- API: a resposta HTTP do "Cheguei" do motorista passa a levar `addressCorrection` (`applied`/`suggested`/`ignored`/`failed`; ausente sem ponto
  e no reenvio). Contrato: `test/trip-http/arrival-address-correction-response.contract.ts`.
- App: a resposta da baixa que fecha a parada traz `nextStop`; `DriverNextStopCard` mostra "Próxima parada: N de M", cliente, endereço, notas e
  o "Iniciar rota" em destaque (mesma função do botão da parada, `departStop`), com "Agora não". A oferta some sozinha quando a parada já saiu,
  chegou ou fechou no snapshot (`isNextStopStillPending`). O aviso de endereço sem localização certa (RF12) aparece no card e junto do botão
  "Cheguei" da parada (`stop.isAddressReliable === false`; a API antiga, sem o campo, não avisa).
- No "Cheguei" o ponto do aparelho já entra no toque (a leitura do carimbo do evento, `completeLocations`); nenhuma leitura nova. O resultado da
  correção vira o aviso "Endereço atualizado..." ou "Enviamos a sua localização para o escritório conferir o endereço." (falha e "ignorado" ficam calados).
- Contrato: `test/driver-trip/next-stop-card.contract.ts`.
- Gates: typecheck e lint limpos (app e API); `bun run test` 2223 pass / 0 fail; build ok; contrato `trip-http` da API 350 pass.
