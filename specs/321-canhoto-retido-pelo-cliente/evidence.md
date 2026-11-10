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
