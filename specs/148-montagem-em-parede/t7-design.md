# T7 — Fila de revisão das notas que não couberam (desenho)

Desenho do architect (opus, 2026-09-13), validado com o usuário no mesmo dia. Implementar depois da T3c.

## Decisões do usuário (2026-09-13)

- **D10 — A saída é por botão, com sugestão de troca.** A nota não sai sozinha quando a planta termina (sair
  muda o hash, recalcula a planta e o empacotador não é monotônico: laço). A tela mostra as notas que não
  couberam, e o botão "Tirar do caminhão as N notas que não couberam" as leva para a fila; na proposta, o
  mesmo no aceite. Junto, **sugestões de troca**: para cada nota de fora, quais notas do caminhão ela poderia
  substituir, com o efeito em porcentagem — "se entrar no lugar desta, o caminhão fica N% mais leve/pesado e
  usa N% a mais/menos de espaço" (peso da NF-e e volume das caixas).
- **D11 — "Sem medida" não sai da viagem**: fica com aviso para medir.
- **D12 — A nota da fila aparece também no conjunto normal** da montagem de roteiro; ao entrar numa viagem por
  qualquer caminho, a entrada da fila fecha (`relinked`).
- **D13 — CT-e não trava a troca nem a mudança.** As viagens são independentes do CT-e: com CT-e autorizado a
  nota pode ser trocada ou movida; a única trava é a de hoje, o despacho da viagem.

## Pré-requisito no pacote

`UnplacedBox` leva só `{count, label, reason}`, sem `documentId`: a API não sabe qual nota não coube. O
`unplaced` passa a vir por nota, com `documentId` (contrato no pacote).

## Modelo de dados (migration aditiva)

Tabela `trip_document_reviews` (`database/trip-document-review.schema.ts`): `id uuid`, `company_id`,
`nfe_document_id`, `source_trip_id`, `source_trip_document_id`, `reason varchar` (`UNPLACED_REASONS` +
`swapped_out`), `layout_id`, `input_hash`, `status varchar` (`pending → moved | swapped_in | relinked`, CHECK,
sem ENUM), `resolution_trip_id`, `resolution_trip_document_id`, `swapped_review_id`, `created_by`,
`resolved_by`, `created_at`, `resolved_at`. Único parcial `(company_id, nfe_document_id) where
status='pending'`; único `(company_id, source_trip_document_id)` (saída idempotente). FKs compostas com
`company_id`. A saída marca `trip_documents.released_at` (`releaseDocument`), nunca apaga.

## Rotas (`trips/presentation/trip-document-review.routes.ts`, companyId do contexto, outro tenant → 404)

- `POST /trips/:id/cargo-layouts/:layoutId/release-unplaced` (`trip.manage`); 409 se o `inputHash` atual ≠ o
  da planta; repetir → 200 com as mesmas entradas. `time_budget` nunca solta nota.
- `GET /trip-document-reviews?status=pending&tripId=` (`fleet.read`).
- `GET /trip-document-reviews/:id/swap-suggestions` — candidatas do mesmo caminhão com Δ% de peso e de volume (D10).
- `POST /trip-document-reviews/:id/move-preview {targetTripId}` → `{layoutId}` (polling reaproveita
  `GET /trips/cargo-layouts/:layoutId`).
- `POST /trip-document-reviews/:id/move {targetTripId, validatedLayoutId}` e `POST …/swap {outTripDocumentId,
validatedLayoutId}`: exige planta `ready`, hash atual e a nota fora de `unplaced`. Idempotente
  (`UPDATE … WHERE status='pending' RETURNING`; mesmo corpo 200, outro corpo 409). Trava: só o despacho
  (`checkTripAcceptsLinkage`), origem e destino (D13). Auditoria em `audit_logs`
  (`trip_document.released|moved|swapped`: ator, nota, viagem origem/destino).
- Aceite da proposta ganha `releaseUnplacedFromLayoutIds` (vincula e solta na mesma transação).

## Tela

`TripReviewQueue.component.tsx` em `TripCargoPanel` e `TripProposalDetail`: "Notas fora do caminhão (N)",
motivo por nota, botões "Trocar por outra nota" (com as sugestões e os Δ%) e "Mover para outro caminhão", só
com `trip.manage` e viagem não despachada. Textos no locale.

## Contratos antes do código

Pacote (`unplaced` por nota com `documentId`); domínio `test/trip-document-review/policy.contract.ts`
(transições, `time_budget` não solta, hash velho 409, sugestão de troca com Δ%); rota
`test/trip-document-review/routes.contract.ts` (403 sem `trip.manage`, 404 outro tenant, 409 despachada,
repetição 200 sem duplicar, troca devolve a outra nota `pending`, move sem caber 409, CT-e autorizado não
trava); `separator-role.contract.test.ts`; `make migration-test`; tela
`frontend-transportada/test/trip/review-queue.contract.ts`. Cada suíte no `package.json` da app.

## Riscos

- O empacotador não é monotônico: depois de tirar as notas, a planta nova pode deixar outra de fora — aparece
  na tela, sem laço.
