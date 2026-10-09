# Feature 257 — A viagem na rua recebe notas

## Problema e resultado

A ADR-0043 §2 fecha o vínculo de nota em `dispatched`: `checkTripAcceptsLinkage` devolve `409
TRIP_ALREADY_DISPATCHED`. A regra protege o roteiro que o motorista levou e o conjunto declarado no
MDF-e, mas não prevê o socorro: um veículo quebra na rua, outra van sai para buscar a carga, e as
notas da viagem quebrada (cancelada) precisam entrar na viagem da van que **já saiu**.

Pedido do usuário (2026-10-08): _"liberar o vínculo com histórico de evento de quem foi e o motivo, pois
podemos ter algum veículo estragando e outra van ir socorrer; e a cancelada deve liberar as notas"_.

Resultado: com a viagem em `dispatched`, `in_transit` ou `on_delivery_route`, quem tem a permissão
abre **Adicionar notas** na viagem, escolhe as notas, escreve o motivo e confirma. As notas entram
carregadas, a rota congelada não muda, e o histórico guarda quem fez, por quê e quais notas.

## Decisões do usuário (2026-10-08)

- Permitir o vínculo depois do despacho, **com evento de histórico: quem e motivo**.
- Cancelar a viagem quebrada **libera as notas** (já é verdade desde a spec 102 — D8 só prova).

## Decisões por delegação (seguem o molde da 249; o usuário pode emendar)

- **D1 — Janela**: `dispatched`, `in_transit`, `on_delivery_route`. `completed` e `cancelled` seguem
  recusadas. Antes do despacho nada muda: `POST /trips/:id/documents[/batch]` continua como está.
- **D2 — Rota nova, ação nova**: `POST /v1/trips/:id/documents/after-dispatch` com
  `{ nfeDocumentIds, reason }` (`reason` 1–500, ids 1–300), `201`. As rotas `/documents` e
  `/documents/batch` **continuam recusando** viagem na rua: a exceção é uma ação com motivo, nunca o
  vínculo comum afrouxado. Ação `linkDocumentsAfterDispatch` em `allowed-actions`.
- **D3 — Permissão**: `trip.report-on-behalf` (a da 249: ação de escritório sobre viagem na rua).
- **D4 — A nota entra `loaded`**: insere com `separation_status='loaded'`, `separated_at` e
  `loaded_at` = agora, e grava `trip_document_events`. Sem isso a nota ficaria `pending` sem saída
  (`checkTripDocumentTransition` bloqueia `separate`/`load` na rua).
- **D5 — Parada**: reaproveita a parada de mesmo `address_key` **só se ainda aberta** (sem
  `arrived_at`/`completed_at`); senão cria nova ao fim (`max(sequence)+1`), sem ETA. A rota
  congelada, o snapshot de despacho, o pedágio e o ETA existentes **não são tocados**.
  `clearPlannedRoute` e `requestCargoLayoutForTrip` **não rodam** nesse caminho.
- **D6 — Só nota solta**: nota já vinculada a viagem viva vira `skipped: already_linked`; nada é
  "movido". Para socorrer, cancela-se a viagem quebrada (libera) e depois adiciona-se. Todo o lote
  falha se a viagem perdeu a janela sob lock.
- **D7 — Fiscal: permitir, avisar, registrar**: nota nova não tem CT-e autorizado e, havendo MDF-e
  `authorized`, não está nele. A resposta e o evento trazem `mdfeDocumentDivergence` e
  `documentsWithoutCte`; o painel avisa. Emitir CT-e/reemitir MDF-e é fluxo existente, fora daqui.
- **D8 — Cancelar libera, qualquer que seja o motivo** (pedido 2026-10-08): `markCancelled` é o único
  caminho de cancelamento e já seta `released_at` em toda nota com `delivered_at is null`, sem olhar
  motivo nem status de origem. Nota **entregue** não volta (já chegou ao destino). Testes de
  integração fixam: cancelada a partir de `draft`, `loading` e `dispatched`/`in_transit`, com motivos
  distintos, libera as notas; a nota liberada entra em outra viagem, inclusive a que já saiu (D2).
- **D9 — Histórico**: tabela `trip_document_link_events`, append-only, molde de `trip_crew_events`:
  `trip_id`, `actor_user_id`, `channel`, `reason`, `nfe_document_ids` (JSON), `stop_ids` criadas,
  `mdfe_document_divergence`, `documents_without_cte`, `created_at`. Grava `audit_logs`. Entra na
  linha do tempo como `kind: 'documents_added'` (o painel publica antes da API — ADR-0081 §9).
- **D10 — Acoplamento a desfazer**: `TRIP_STATUSES_BEFORE_DISPATCH` deriva de
  `checkTripAcceptsLinkage` (trip-planned-route-clear.support.ts). Vira lista explícita; senão a
  mudança passaria a apagar a rota congelada.

## Requisitos

- **RF1** A ação só aparece em `allowed-actions` na janela D1 e com a permissão.
- **RF2** Vínculo, paradas, eventos da nota, evento de histórico e auditoria na **mesma transação**,
  sob lock da viagem, reconferindo a janela sob lock.
- **RF3** Rota congelada, snapshot, status, veículo e tripulação byte a byte como estavam.
- **RF4** O motorista vê a nota e a parada nova no app sem ação extra.
- **RF5** Linha do tempo mostra quem, quando, o motivo e quantas notas; com aviso fiscal quando houver.
- **RF6** Viagem fora da janela → `409` com o código do estado; sem permissão → `403`.

## Fora do escopo

Mover nota entre viagens vivas · reordenar/reotimizar a rota · emitir CT-e ou reemitir MDF-e ·
push ao motorista · desvincular nota depois do despacho.
