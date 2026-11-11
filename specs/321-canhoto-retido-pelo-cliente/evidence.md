# Evidência — Feature 321

## T0 — leitura do código (10/11/2026, `origin/staging` @ 4a10a60)

Só leitura. Caminhos relativos a `apps/`. Cada achado abaixo mudou o desenho da spec.

1. **Nota entregue não pode ser solta nem entrar em outra viagem.** `api-transportada/src/database/trip.schema.ts:1131-1134`:
   CHECK `trip_documents_delivered_locks_release_check` (`delivered_at is null or released_at is null`), com o comentário "a nota
   nunca mais migra para outra viagem". O índice único `trip_documents_live_nfe_document_unique` (`:1120`) garante uma linha viva
   por NF-e. Todo escritor de liberação filtra `delivered_at is null` (`trip-document-review-link.support.ts:148`,
   `drizzle-trip.repository.ts:1192`, `moveLiveLinksFromOtherTrips` `:533`). Vincular cria linha **nova**
   (`linkDocumentsBatch`, `drizzle-trip.repository.ts:862-920`), mas a linha entregue segue "viva" e a nota fica `already_linked`.
2. **Não existe reentrega sem a contratante.** `occurrence-case-state.policy.ts:74-89`: `decide` só sai de `awaiting_contractor`,
   visível ao portal (`occurrence-case.policy.ts:34`). A spec 260 (`specs/260-a-nota-que-volta-ao-barracao-fica-disponivel`) propõe o
   caminho `review → warehouse_return`, mas está toda em `[ ]`. E a proposta de reentrega é recusada com a viagem já despachada
   (`checkTripAcceptsLinkage`, `trip-state.policy.ts:175`): a retenção acontece, por definição, com a viagem na rua.
3. **O casamento do canhoto é por viagem.** A rotina `trip.canhoto.read` casa o número só com as notas da **mesma viagem** do
   comprovante (`drizzle-canhoto-read-queue.repository.ts:61-77,119-129`, `canhoto-barcode.policy.ts:82-99`). O caminho do bot
   monta "notas abertas de quem mandou" na API e descarta `delivered`/`returned`
   (`whatsapp-canhoto-recognition.service.ts:50,198-216`). A nota só casa para o motorista da viagem nova se houver um vínculo
   **dele**, aberto.
4. **`notifies` não é o interruptor da contratante.** É aviso interno da 079 (`register-trip-occurrence.use-case.ts:557-590`). A
   ocorrência do motorista avisa a equipe sempre (275, `register-driver-occurrence.use-case.ts:134-143`). O aviso à contratante é
   `emails_contractor` + chave do modelo: `send-automatic-occurrence-mail.use-case.ts:92-96`,
   `drizzle-occurrence-mail.repository.ts:624`, SQL do varredor do worker
   (`drizzle-occurrence-automatic-mail-queue.repository.ts:57,70`). **Envios manuais não leem o tipo**: chat/e-mail do escritório
   (`occurrence-conversation.routes.ts:83,491`, `send-occurrence-mail.use-case.ts:122-161`).
5. **Spec 318 só existe como PR aberto (#646, sem código no staging).** A guarda do canal de grupo vale quando ela entrar.
6. **Resolução automática (266) não cabe sem mudar o banco.** O CHECK `trip_occurrence_resolution_events_system_case_event_check`
   exige `case_event_id` ou `contractor_reply_id` quando `actor_kind = 'system'`; `reopened` só aceita `driver` com mensagem.
   `SystemResolutionPhraseKey` (`occurrence-resolution.types.ts:46-50`) tem 4 chaves, nenhuma de canhoto.
7. **O marcador da 173 só existe para tipo que abre tratativa** (`occurrence-case-marker.query.ts:22-50`). A flag nova segue o molde
   do `proofPending` (223): `proof-pending.query.ts:84`, `trip.mapper.ts:109`, `trip.routes.ts:2579` (serializador 'safe' com
   contrato), painel `proofPendingMarker.service.ts`, `TripStopList.component.tsx:~622-632`, locale `trip.locale.json:1382`.
8. **Soma de carga:** o precedente é `countedNfeDocumentIds` (spec 187, `trip-cargo-weight.support.ts:95-131`). Leitores a tratar:
   `drizzle-trip.repository.ts:1679-1692,1792-1810,1886`, `trip-list-occupancy.query.ts:~132-235`,
   `trip-cargo-layout-input.support.ts` (**já diverge**: não filtra soltas, muda o hash do worker), `trip-cargo-preview.query.ts`,
   `preview-trip-cargo.use-case.ts:141,160`, `drizzle-trip-document-review.repository.ts:163-215`, `trip-occurrence-feed.query.ts:758-811`;
   painel `TripCargoPanel`, `TripOccupancyBars`, `TripProposalList` (excesso de peso), `TripDetail`. Não há "trava de capacidade"
   na API: só informativo (`payloadRatio`).
9. **A contratante e os relatórios leem o vínculo vivo.** `contractor-delivery.query.ts:36-68`, `drizzle-trip-report.repository.ts:85,131,163`,
   `drizzle-driver-score.repository.ts:226`, `trip-valuation.query.ts:1154`. Uma segunda linha viva da mesma NF-e dobraria contagem,
   score e rateio de custo e mostraria a nota "em rota" de novo ao portal.
10. **O catálogo não expressa o tipo.** `OccurrenceTypeCatalogEntry` não grava `note_mode`, `attachment_mode` nem `redelivery_policy: allowed`
    e o seed só atua em empresa **sem nenhum tipo**. O tipo vai por cadastro/script, não pelo catálogo.
11. **Duplicidade:** a recusa já existe (`duplicate_request_policy`, spec 276): basta configurar `until_resolved` no tipo.
12. **O filtro de tipo da lista (277) é por nome**; renomear o tipo quebra o filtro. Filtro por id não existe.

## T1 — marcas do tipo e guarda da contratante (10/11/2026)

Base: `origin/staging` @ 73ec3d1 + PR #668 (opção A). Caminhos relativos a `apps/`.

**Banco.** Migration `api-transportada/drizzle/20261110210213_occurrence_contractor_notice_block`: `blocks_contractor_notice boolean
default false not null` e `counts_cargo_on_pickup_trip boolean default true not null` em `company_occurrence_types`, sem `UPDATE`
(nenhum tipo muda). `rollback.sql` recusa rodar com tipo marcado (`blocks_contractor_notice` ou `counts_cargo_on_pickup_trip = false`).
Snapshot gerado por `db:generate`. Contrato estático: `test/database-migration/occurrence-contractor-notice-block.static.contract.ts`.

**Cadastro.** `GET`/`PUT /company-settings/occurrence-types` leem e gravam `blocksContractorNotice` e `countsCargoOnPickupTrip`
(ausente é "não mexa"). Leitura escolhida para "o cadastro recusa `true`" (D4c), já que a T1 ainda não tem marca de "tipo com coleta":
`true` só passa quando já é o gravado (ou na criação, onde é o padrão); voltar a `true` um tipo gravado com `false` é
`422 OCCURRENCE_TYPE_PICKUP_CARGO_UNSUPPORTED` (`isPickupCargoCountingUnsupported`). Assim o painel pode mandar o tipo inteiro sem erro.

**Guarda (D2).** Regra única `occurrenceTypeNeverNotifiesContractor` (`trips/domain/occurrence-contractor-notice.policy.ts`), lida em:

1. e-mail automático e grupo da 318 (`send-automatic-occurrence-mail.use-case.ts`): `skipped`/`contractor_notice_blocked` antes de
   reservar o grupo; o leitor do plano nem lê contato, modelo ou grupo;
2. varredor do worker (`drizzle-occurrence-automatic-mail-queue.repository.ts`): `and t."blocks_contractor_notice" = false`, cópia por valor
   com contrato que monta o SQL de verdade (`worker test/occurrence-automatic-mail-sweep/contractor-notice-block.contract.ts`);
3. envio manual do escritório: e-mail e reenvio da 248 (`send-occurrence-mail.use-case.ts`), chat por e-mail
   (`send-occurrence-chat-mail.use-case.ts`, só a plateia contratante: o chat do cliente segue) e portal
   (`contractor-portal-message.use-case.ts`), todos `409 OCCURRENCE_CONTRACTOR_NOTICE_BLOCKED` sem gravar nada. A marca chega pelo alvo
   (`findOccurrenceTypeBlocksContractorNotice`, `trips/infrastructure/occurrence-contractor-notice.query.ts`).

`notifies` não foi tocado: o aviso interno da 275 (`register-driver-occurrence`) continua igual.

**Testes.**

- CA01: contratos em `test/trip-occurrence/contractor-notice-block.contract.ts`, `test/occurrence-conversation/{automatic-mail,
automatic-group,occurrence-mail,occurrence-chat-mail,contractor-portal-message,client-chat-mail}.contract.ts` e no worker; o filtro do
  varredor foi tirado à mão e 4 testes ficaram vermelhos (contrato + integração), voltando ao verde com ele.
- CA02 contra Postgres: `test/integration/occurrence-automatic-mail.integration.ts` ("spec 321 (CA01/CA02)"): tipo marcado com o
  automático ligado devolve `contractor_notice_blocked`, o manual é 409 e nenhuma linha de e-mail ou conversa nasce. Worker:
  `test/occurrence-automatic-mail-sweep.integration.test.ts` (10 pass).
- CA02, equipe interna: `test/trip-occurrence/driver-notification.contract.ts` ("spec 321 (CA02)"): o tipo marcado ainda avisa a equipe pela 275.
- API `bun run test`: 14884 pass, 0 fail. `tsc --noEmit` e `eslint` limpos na API e no worker.

## T2 — a coleta de canhoto nasce com a ocorrência (10/11/2026)

Base: `origin/staging` @ 3736604 (T1 mergeada, PR #671), depois com a staging mergeada (#672, #673, #675): a migration foi regerada depois da `20261110214656`. Caminhos relativos a `apps/api-transportada/`.

**Marca "tipo com coleta".** Coluna `company_occurrence_types.creates_canhoto_pickup` (boolean, padrão `false`), lida e gravada por
`GET`/`PUT /company-settings/occurrence-types` como `createsCanhotoPickup` (ausente é "não mexa"). Ela substitui a leitura provisória da T1
para D4c: a regra agora é `resolvePickupCargoCounting` (`src/trips/domain/canhoto-pickup.policy.ts`). No tipo **com** coleta (gravado ou
pedido) só `countsCargoOnPickupTrip = false` vale: `true` explícito é `422 OCCURRENCE_TYPE_PICKUP_CARGO_UNSUPPORTED`; ausente vira `false`
quando o gravado (ou o padrão `true` da coluna, na criação) é `true`. No tipo **sem** coleta o valor passa como veio, inclusive `true` (a
recusa da T1 "voltar a `true` depois de `false`" saiu: sem a marca ela não tinha objeto). O painel (T5) manda as três chaves juntas.

**Banco.** Migration `drizzle/20261110220029_canhoto_pickups` (gerada por `db:generate`, com snapshot): tabela `trip_canhoto_pickups`
(`company_id`, `nfe_document_id`, `origin_trip_document_id`, `occurrence_id`, `pickup_trip_id`, `pickup_stop_id`, `status`
`pending | scheduled | collected | cancelled`, `collected_at`), FKs compostas por `(company_id, id)` (ocorrência `cascade`; origem, NF-e,
viagem e parada `restrict`, porque `set null` numa FK composta zeraria `company_id`), CHECKs (`pending` sem viagem nem parada, `scheduled`
com viagem, parada só com viagem, `collected` ⇔ `collected_at`), uma coleta por ocorrência e **uma aberta por vínculo de origem** (índice
único parcial `trip_canhoto_pickups_open_origin_unique`). Nada toca `trip_documents`. `rollback.sql` recusa rodar com coleta gravada ou tipo
marcado. A tabela entrou na política do recorte do staging (`deploy/staging-refresh/prune-source.sql`, `keep`).

**Registro (RF2, D4).** `saveTripOccurrence` (`delivery-proof-read.support.ts`), o escritor único dos três caminhos (app/WhatsApp do
motorista, galpão e lote do escritório), cria a coleta `pending` logo depois da ocorrência, **na mesma transação**
(`createPendingCanhotoPickup`, `src/trips/infrastructure/canhoto-pickup.query.ts`; a NF-e vem do próprio vínculo, nunca do payload). A
marca é lida na consulta do tipo que a trava de repetido já fazia (`assertNoDuplicateOccurrenceRequest` agora a devolve), sem leitura nova.
Se a coleta não nasce, a transação inteira desfaz (`CanhotoPickupNotCreatedError`, ou o índice parcial).

**Repetido (D1, D6).** No tipo com coleta a política vale `until_resolved` qualquer que seja a gravada (`effectiveDuplicateRequestPolicy`), a
ocorrência está aberta enquanto a coleta está `pending | scheduled` (`isCanhotoPickupOpen`; sem coleta, segue o andamento da 266), e
**qualquer** coleta aberta da mesma nota bloqueia, de outro tipo com coleta inclusive (`findOpenCanhotoPickupOccurrenceId`). A trava
advisory do tipo com coleta é por nota (`…:canhoto-pickup`), não por tipo. O app do motorista recebe a ocorrência aberta (como na 276); galpão
e escritório, `409 TRIP_OCCURRENCE_DUPLICATE_REQUEST` com o id.

**Cancelamento (167).** `writeOccurrenceCancellation` cancela a coleta ainda aberta na mesma transação (`cancelOpenCanhotoPickup`); a
coletada fica como está.

**Fora da T2 (fica para a T3/T4):** encaixe da coleta numa viagem (`scheduled`), volta a `pending` ao cancelar a viagem, casamento do canhoto
e a resolução pela 266. Até lá nenhum escritor põe a coleta em `scheduled`/`collected`.

**Testes.**

- CA03 contra Postgres: `test/integration/canhoto-pickup-registration.integration.ts` (6 testes): nota entregue, o registro do tipo com
  coleta grava a ocorrência e a coleta `pending` (NF-e e origem certas, sem viagem), e a linha de `trip_documents` e o status da viagem
  ficam **idênticos** ao de antes; soltar a nota entregue continua recusado pelo banco. Tipo sem a marca não cria coleta. Com a coleta
  aberta, o mesmo tipo (gravado `allow`) e outro tipo com coleta são repetidos (motorista recebe a mesma, escritório 409). Coleta
  `collected` ou ocorrência cancelada liberam a nota (o cancelamento cancela a coleta). Coleta que não pode nascer desfaz a ocorrência junto.
  Dois registros simultâneos gravam uma ocorrência e uma coleta. Junto: `occurrence-duplicate-request.integration.ts` (4 pass, sem mudança).
- Contratos: `test/trip-occurrence/canhoto-pickup.contract.ts` (marca, fronteira, mapeamento, tabela de decisão de D4c, cadastro, D6, CHECK de
  entregue no schema), `test/database-migration/canhoto-pickups.static.contract.ts` (aditiva, sem `ALTER TABLE "trip_documents"`, rollback),
  `test/trip-schema/tenant-safety.contract.ts` (FKs compostas e `companyId` em toda junção/filtro de `canhoto-pickup.query.ts`).
  `contractor-notice-block.contract.ts` trocou a tabela da recusa da T1 pela regra do tipo sem coleta.
- `bun run test`: 14909 pass, 0 fail. `db:test` (migration + rollback em Postgres descartável): 253 pass. `tsc --noEmit`, `eslint` e
  `prettier --check .` limpos.

## T3 — o escritório encaixa a coleta (10/11/2026)

Base: `origin/staging` @ 03427e3 (T2 mergeada, PR #674). Caminhos relativos a `apps/api-transportada/`.

**Rotas (RF4, D7).** `GET /trip-canhoto-pickups?status=&tripId=&limit=` (status repetível, até 200), `POST /trip-canhoto-pickups/:pickupId/schedule`
`{ tripId }` e `POST /trip-canhoto-pickups/:pickupId/unschedule`, todas `trip.report-on-behalf` (encaixar mexe em viagem que pode estar na
rua, como a 257; o separador não alcança). Resposta `{ data: CanhotoPickupView }` com `id`, `status`, `occurrenceId`, `nfeDocumentId`,
`documentNumber`, `originTripId`, `originTripDocumentId`, `originStopLabel`, `pickupTripId`, `pickupStopId`, `createdAt`. Corpo e query
fechados (`.strict()`, parâmetro desconhecido é 400). Composição em `main.ts`, use case `canhoto-pickup-schedule.use-case.ts`, escrita em
`trips/infrastructure/canhoto-pickup-schedule.persistence.ts`.

**Regra (`decideCanhotoPickupSchedule`).** Só coleta aberta (`collected`/`cancelled` → `409 CANHOTO_PICKUP_CLOSED`); nunca a viagem de origem
(`422 CANHOTO_PICKUP_ORIGIN_TRIP`: o canhoto que volta ao próprio motorista é a foto na viagem de origem, T4); nunca viagem `completed`/`cancelled`
(`409 CANHOTO_PICKUP_TRIP_CLOSED`); qualquer outro estado serve, inclusive na rua. A entrega precisa de parada (`422 CANHOTO_PICKUP_WITHOUT_ADDRESS`).
Mesma viagem é no-op; outra viagem **move** a coleta na mesma transação. Leitura escolhida para "viagem de outro motorista": recusar só a viagem de
origem; o mesmo motorista numa viagem nova é aceito (ele pode voltar ao cliente noutro dia). Viagem de outra empresa é `404 TRIP_NOT_FOUND`;
coleta de outra empresa, `404 CANHOTO_PICKUP_NOT_FOUND`; desencaixar o que não está encaixado, `409 CANHOTO_PICKUP_NOT_SCHEDULED`; corrida,
`409 CANHOTO_PICKUP_CHANGED`.

**A parada.** A coleta vai para a parada **aberta** (sem chegada nem baixa) da viagem com a mesma `address_key` da parada de origem (o lugar onde o
cliente segurou o canhoto), ou para uma parada nova no fim da sequência, com o rótulo da origem. Antes do despacho a parada nova mata a rota
planejada na transação (`clearPlannedRoute`) e o use case recongela depois do commit, best-effort (spec 153 T704); depois do despacho a rota
congelada fica (como a 257).

**A coleta ocupa a parada.** Como a parada é derivada e a FK da coleta é `restrict`, os dois escritores que apagam parada vazia passaram a contar a
coleta `scheduled` (`listStopsWithScheduledCanhotoPickup`): o port do reconciliador (`countLiveDocumentsAtStop`, usado por desvincular, retirar e
desvio de endereço) e a liberação das notas deixadas para trás no despacho (`drizzle-trip-route.repository.ts`). Desencaixar ou mover apaga a parada
que ficou vazia **e intocada** (sem chegada, baixa nem "a caminho"; parada tocada fica para não apagar eventos em cascata). Retirar a parada do
rascunho (`retireStop`) devolve a coleta encaixada nela a `pending` e apaga a parada.

**Volta a `pending` (casos extremos).** Viagem cancelada ou concluída devolve a coleta encaixada a `pending` (`returnScheduledCanhotoPickupsOfTrip`),
chamada por `recordTripStatusChange`, o escritor único de transição (ADR-0068): todo caminho que finaliza a viagem (cancelar, encerrar, derivação
pelas notas, conclusão pelas paradas) passa por ali na mesma transação. A parada fica no histórico.

**Carga (D4c, CA03b).** Nada a somar: a coleta não é linha de `trip_documents`. Contrato estático de que nenhum leitor de T0 §8–9 lê a tabela.

**Trilha.** `audit_logs` `canhoto_pickup.scheduled|unscheduled`, com viagem/parada antes e depois, na mesma transação. Travas: viagens
`FOR NO KEY UPDATE` em ordem de id, depois a coleta `FOR UPDATE` (a mesma ordem do fechamento da viagem).

**Para a T4/T6.** A parada só de coleta não tem nota: ela fica aberta até a T4/T6 a fecharem com a foto do canhoto. Enquanto isso a viagem conclui
pelas notas (a derivação) ou pelo botão encerrar, e a coleta volta a `pending`. O app ainda não mostra a parada como "Coletar canhoto" (T6), e o
detalhe da viagem ainda não traz a flag (T5, painel tolerante antes).

**Testes.**

- Contrato `test/trip-occurrence/canhoto-pickup-schedule.contract.ts`: tabela da regra, códigos e status das recusas, rotas (política, query e corpo
  fechados, empresa e ator do token), recongelamento só das viagens que mudaram e falha do congelamento que só avisa, e CA03b estático (12 leitores).
  `test/trip-schema/tenant-safety.contract.ts`: `companyId` em toda junção e filtro do arquivo novo.
- Postgres `test/integration/canhoto-pickup-schedule.integration.ts` (6 testes): encaixe em parada nova com o endereço da origem, `occupancy` e
  `cargoWeight` da viagem nova iguais e `trip_documents` intocada (CA03b), trilha, no-op; reaproveita a parada aberta do mesmo endereço; mover e
  desencaixar apagam a parada só de coleta, e soltar a última nota de uma parada com coleta não a apaga; retirar a parada leva a coleta; cancelar e
  encerrar a viagem devolvem a `pending`; recusas (origem, concluída, inexistente, outra empresa, coletada, não encaixada).
- `bun run test`: 14945 pass, 0 fail. `tsc --noEmit` e `eslint` limpos.

## T4 — o canhoto colhido fecha a coleta (11/11/2026)

**A foto da coleta é o canhoto da entrega de origem.** A parada só de coleta não tem nota, então a foto não pode ter comprovante próprio: o
motorista da viagem nova manda a foto e ela vira o comprovante `photo` do evento de entrega da nota **na viagem de origem**, pelo mesmo
`attachDeliveryProof` de sempre, com a opção nova `canhotoPickup: { originTripId }`. Com ela o evento é procurado na viagem de origem (o motorista
que coleta não está nela), a foto troca o canhoto que a nota já tinha (é o que se foi buscar, sem `replaceCanhoto`) e não classifica pontualidade
(`not_required`: não pune nem lava o motorista de origem). Daí em diante é o caminho de qualquer canhoto: a gravação zera o veredito para `pending`,
a rotina `trip.canhoto.read` do worker o lê (a fila não filtra viagem concluída, e casa o código de barras contra as notas da viagem do
comprovante, onde a nota de origem está) e a conferência decide. **O worker não mudou.**

**Entradas.** App: `POST /me/trips/current/canhoto-pickups/:pickupId/proof` (multipart do comprovante, `trip.report`, só `kind=photo`, senão
`400 CANHOTO_PICKUP_PROOF_KIND`). Bot: as coletas `scheduled` ainda sem foto das viagens não finalizadas em que o motorista está na tripulação
entram como notas abertas (a nota de origem, rótulo "canhoto a buscar", `pickupId` na candidata da pergunta), e a foto casada (direto ou pela
resposta) vai pela coleta, com a fala `pickupCollected`. Os dois chamam `collectCanhotoPickupPhoto`. BOLA: a coleta precisa estar `scheduled`
numa viagem (não cancelada) com o motorista em `trip_drivers`; o resto é `404 CANHOTO_PICKUP_NOT_FOUND`, antes de qualquer gravação.

**Depois da foto** (`recordCanhotoPickupPhotoSent`, transação própria; travas viagem da coleta `FOR NO KEY UPDATE` → coleta `FOR UPDATE`, a ordem
da T3): `photo_sent_at` uma vez, a parada só de coleta fecha (sem nota viva nem outra coleta à espera; chegada que ninguém tocou vira a hora do
fechamento) e, se era a última aberta, a viagem conclui por `completeTripIfSettled` (que grava `trip_status_events`). A mesma imagem que já é o
canhoto desta nota conta como reenvio; de outra nota, não fecha nada. `returnScheduledCanhotoPickupsOfTrip` (T3) agora pula a coleta com foto: o
fim da viagem não desfaz uma foto que espera a conferência. CHECK novo: `photo_sent_at` só com `scheduled`/`collected`.

**A conferência decide (D5, RF6).** `reviewCanhotoProof` chama `settleCanhotoPickup` na mesma transação, depois de gravar um veredito que mudou:

- **aprovado** (automático que casa ou pessoa): a coleta aberta da nota vira `collected` (`collected_at`), a parada só de coleta fecha se ainda
  aberta, e a ocorrência (travada `FOR NO KEY UPDATE`, estado lido depois da trava, por `seq`) recebe `resolved` do `system` com
  `canhoto_pickup_id`, a não ser que esteja cancelada ou já resolvida;
- **reprovado** (pessoa; também sobrepõe a aprovação automática): a coleta `collected` (ou a `scheduled` com foto) volta a esperar o canhoto —
  `scheduled` se a viagem dela segue aberta, `pending` sem viagem/parada se já acabou —, com `photo_sent_at`/`collected_at` zerados; outra coleta
  já aberta da mesma entrega impede reabrir a antiga. Ocorrência resolvida recebe `reopened` do `system`;
- `pending` (leitura sem casamento) e decisão repetida não mexem na coleta.

**Andamento 266.** Migration `20261111002237_canhoto_pickup_resolution` (aditiva): `trip_occurrence_resolution_events.canhoto_pickup_id` (FK
composta `restrict`, índice parcial, só em ocorrência de nota), os CHECKs de causa única do `system` passam a contar três causas e o de reabrir
aceita `system` com a coleta. `rollback.sql` recusa enquanto houver evento ligado a coleta ou coleta com foto. Frase `canhoto_collected`
(`SystemResolutionPhraseKey`); o `reopened` do `system` sai na linha do tempo com ator `system` e `messageId: null`. Espelhos: app do motorista
(`ROUTE_OCCURRENCE_PHRASE_KEYS` + pt/en) e painel (`resolvedCanhotoCollected`, `reopenedAutomatic` + pt/en). Os dois já toleravam a chave
desconhecida e o ator `system`, então não há ordem de publicação a respeitar. A parada "Coletar canhoto" no app é da T6; a rota está pronta.

**Testes.**

- Contrato: `test/trip-occurrence/canhoto-pickup-collection.contract.ts` (caso de uso: nota e viagem de origem, BOLA 404 sem gravar, só `photo`,
  reenvio da mesma imagem, imagem de outra nota); `test/canhoto-review/use-case.contract.ts` (aprovar pessoa/robô fecha, reprovar reabre,
  `pending` e repetição não mexem); `test/whatsapp-commands/canhoto-recognition.contract.ts` (a coleta entra nas candidatas, a foto casada e a
  resposta vão pela coleta, motorista só com coleta ainda recebe foto); frase em `occurrence-resolution-policy.contract.ts`; coluna e CHECK em
  `canhoto-pickup.contract.ts`; migration e rollback em `canhoto-pickup-resolution.static.contract.ts`; empresa em toda junção do arquivo novo
  (`tenant-safety.contract.ts`); `no-gate.contract.ts` aceita o caso de uso da conferência lendo o veredito que gravou (fecha coleta, não barra
  nada). Painel e app: frase e reaberto do sistema.
- Postgres `test/integration/canhoto-pickup-collection.integration.ts` (4 testes, CA04): foto do motorista 2 vira o canhoto `pending` da nota de
  origem, `photo_sent_at`, parada fechada, a coleta some da lista do bot; leitura automática que casa → `collected` + `resolved`/`system`/coleta e
  estado `resolved` com a causa; reprovação → `scheduled` na mesma viagem + `reopened`/`system`; última parada fechada pela foto conclui a viagem e
  a coleta fotografada não volta a `pending` (reprovada depois, vai a `pending`, sem `reopened` porque nunca resolveu); motorista fora da viagem
  404 sem gravar; reenvio converge; aprovar duas vezes grava um `resolved` só.
- `bun --env-file=../../.env.test test` (depois do rebase sobre a 319 T2): 15020 testes, 0 fail. Integração relacionada (coleta T2/T3/T4, conferência do canhoto, `me-trip`,
  andamento, resumo, retorno da contratante): 98 pass. `db:test` contra Postgres (migration e rollback): 261 pass. Painel `bun run test` 1496
  pass, app do motorista 2299 pass. `tsc`, `eslint` e `prettier --check` limpos.

## T5 — o painel da coleta de canhoto (11/11/2026)

Base: `origin/staging` @ 9ee26ef. Caminhos relativos a `apps/frontend-transportada/src/modules/`. Painel **tolerante**: vai antes da API (ADR-0081 §9).

**Aba Tipos (RF1).** `blocksContractorNotice`, `createsCanhotoPickup` e `countsCargoOnPickupTrip` são opcionais no tipo e nas guardas (`TYPE_FIELD_CHECKS`) e só aparecem com a API que já os manda; o `PUT` não os manda sem edição.
Ligar "Cria coleta de canhoto" manda junto `countsCargoOnPickupTrip: false` (D4c) e o "Somar peso e dimensão na viagem da coleta" aparece travado, com a dica de que na fase 1 não se altera. Checkbox e tooltip do design system, ao lado dos vizinhos (`OccurrenceTypeIdentity`).

**Encaixe (RF4, D7).** `TripCanhotoPickups` no detalhe da viagem: lista as coletas encaixadas nesta viagem (com "Desencaixar") e as que ela pode receber (pendentes ou de outra viagem; nunca a de origem), com "Encaixar nesta viagem". Cliente próprio das rotas da T3
(`GET/POST /trip-canhoto-pickups…`, guarda de chaves exatas, código de erro nomeado em pt-BR/en), só com `trip.report-on-behalf`; viagem concluída ou cancelada não oferece encaixe. Encaixar/desencaixar invalida o detalhe da viagem.

**Flag e tooltip (D4d).** `CanhotoPickupFlag` ("Coleta de canhoto" na coleta; "Canhoto retido" na nota de origem), tooltip "Esta nota volta só para buscar o canhoto; peso e dimensão não entram na carga desta viagem." A nota de origem lê `documents[].canhotoRetained` **opcional** (molde do `proofPending`: só `true` marca; ausente é API anterior).
O nome do campo é o contrato que a API deve seguir.

**Fora desta task (precisa da API).** O filtro da lista de ocorrências por **id do tipo** (D6): o feed só aceita `typeIn` por nome e recusa parâmetro desconhecido com 400, então o painel não pode mandar um `typeIdIn` antes da API. Fica para a T7 (API + painel).
A API também ainda não manda `canhotoRetained` no detalhe da viagem.

**Testes.** Contrato `test/trip/canhoto-pickup.contract.ts` (guarda, divisão por viagem, marcador tolerante, cliente com fetch falso, locales, edição do tipo). `bun run test` 0 fail (3157 no `trip.contract`), `tsc`, `eslint` e `prettier --check` limpos.
Prints (claro/escuro, desktop 1440 e celular 375) em `specs/321-*/prints/` pelo `test/spec-321-prints.smoke.spec.ts` (fora da CI).

## T6 — a parada "Coletar canhoto" no app do motorista (11/11/2026)

Base: `origin/staging` @ 5c3d2dd. A API **não mandava a coleta ao motorista** (T3/T4 deixaram só a rota da foto), então a T6 tem uma
fatia pequena de API e a do app. Caminhos relativos a `apps/`.

**API (aditiva, tolerante).** `DriverTripStop.canhotoPickups?` no snapshot de `GET /me/trips/current`: as coletas `scheduled` encaixadas nas viagens
**do motorista** (o recorte é o vínculo de tripulação que `listActiveTrips` já faz), com `id`, `documentNumber`, `documentSeries`, `recipientDisplayName`
e `photoSentAt` — nada de valor, peso nem chave da nota de origem. Uma consulta só para todas as paradas, **isolada do `Promise.all`** como o
`occurrenceTypes` (`.catch(() => null)`: sem a coleta o snapshot segue de pé). A leitura de custo fixo subiu de 26 para 27 consultas
(`driver-current-trip-query-count.integration.ts`, medida contra Postgres). Integração (`canhoto-pickup-collection.integration.ts`, CA04): o snapshot
traz a coleta na parada da viagem nova sem foto e, depois da foto, com `photoSentAt`.

**App (`frontend-driver`).** Tipos e leitura tolerante (`readCanhotoPickups`: ausente, malformado ou item sem id some, o resto do snapshot vale).
`DriverCanhotoPickupList` no cartão da parada: título "Coletar canhoto", **explicação escrita** (não em tooltip: no celular não há passar o mouse), nota
e cliente de origem, a foto (o mesmo bloco de captura da ocorrência, reduzido a JPEG no aparelho pela redução do canhoto) e "Enviar canhoto". O envio
vai **direto** pela rota da T4 (`POST /me/trips/current/canhoto-pickups/:pickupId/proof`, multipart `kind=photo` com `capturedAt` e o desvio do relógio),
**sem fila offline**: a coleta já existe no servidor e a conferência decide; sem sinal o cartão diz que não enviou e deixa tentar de novo
(`offline` x `failed` x `sent`). Depois da foto o cartão mostra "Foto enviada. O escritório confere o canhoto." O ajudante vê a coleta, sem câmera
nem envio. `isStopResolved` não dá a parada só de coleta por resolvida enquanto não há foto (antes, parada sem nota contava como resolvida e a barra
mentia); o resumo da parada diz "N canhoto para coletar" em vez de "0 nota para entregar". `OccurrencePhotoField` ganhou o `attachedLabel` opcional.

**Golden do cartão.** `driver-stop-card.golden.html` foi regravado (`GOLDEN_WRITE=1`): a única diferença são os dois `aria-controls` do React
(`useId` é por posição na árvore e o cartão ganhou um irmão novo); o markup é o mesmo.

**Fora desta task (T7, API + painel).** Filtro da lista de ocorrências por id do tipo (`/trip-occurrences` ainda recusa o parâmetro) e o campo opcional
`canhotoRetained` no detalhe do documento (o painel já o lê tolerante).

**Testes.** `test/driver-trip/canhoto-pickup.contract.tsx` (leitura tolerante, parada só de coleta, cartão pt/en com foto pendente, enviada, ajudante e
sem coleta, cliente com fetch falso: rota, `kind=photo`, relógio, recusa do servidor, barra de progresso). `bun run test` no app: 2317 pass, 0 fail;
`tsc`, `eslint` e `prettier --check` limpos. API: 15064 contratos, 0 fail; integração relacionada contra Postgres 16 (coleta T4, `me-trip`, custo fixo).
Prints (claro/escuro, desktop 1280 e celular 375; vazio, com foto, enviada) em `specs/321-*/prints/coleta-*.png` pelo `test/spec-321-prints.smoke.spec.ts`
(fora da CI; os componentes são os padrão do app, comparados com a ocorrência e o "Não entreguei").

## T7 (API) — filtro `typeIdIn` e `canhotoRetained`

Contrato `test/trip-occurrence/feed.contract.ts` (typeIdIn aceita UUID, recusa o resto), marcador em `test/integration/canhoto-pickup-registration.integration.ts`. `tsc` limpo; API: 15030 contratos, 0 fail. **Ainda aberto na T7:** tipo no script de staging (dry-run), publicação painel → API → app e conferência de CA01–CA05 em staging, que pedem acesso ao ambiente.

**Tipo em staging.** `apps/api-transportada/scripts/canhoto-retido-type-publish.ts` (simula sem `--confirm`; só cria, nunca reescreve) e o invólucro `ops-scripts/staging-canhoto-retido-tipo.sh` (simula, pede "sim", grava a saída em `tmp/ops/saidas/`). Só roda depois que o PR da T7 estiver publicado em staging.
