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

Base: `origin/staging` @ 3736604 (T1 mergeada, PR #671). Caminhos relativos a `apps/api-transportada/`.

**Marca "tipo com coleta".** Coluna `company_occurrence_types.creates_canhoto_pickup` (boolean, padrão `false`), lida e gravada por
`GET`/`PUT /company-settings/occurrence-types` como `createsCanhotoPickup` (ausente é "não mexa"). Ela substitui a leitura provisória da T1
para D4c: a regra agora é `resolvePickupCargoCounting` (`src/trips/domain/canhoto-pickup.policy.ts`). No tipo **com** coleta (gravado ou
pedido) só `countsCargoOnPickupTrip = false` vale: `true` explícito é `422 OCCURRENCE_TYPE_PICKUP_CARGO_UNSUPPORTED`; ausente vira `false`
quando o gravado (ou o padrão `true` da coluna, na criação) é `true`. No tipo **sem** coleta o valor passa como veio, inclusive `true` (a
recusa da T1 "voltar a `true` depois de `false`" saiu: sem a marca ela não tinha objeto). O painel (T5) manda as três chaves juntas.

**Banco.** Migration `drizzle/20261110213420_canhoto_pickups` (gerada por `db:generate`, com snapshot): tabela `trip_canhoto_pickups`
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
