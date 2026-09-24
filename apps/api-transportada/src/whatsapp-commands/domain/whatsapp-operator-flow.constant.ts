/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T016 — o ramo "Viagens do armazém" do operador. Ids de nó, `actionKind` e chaves de
 * contexto do fluxo, num lugar só — o grafo (`whatsapp-flow-graph.constant.ts`) e as `FlowAction`s
 * (`register-operator-trip-flow-actions.ts`) importam daqui, nunca redeclaram a string solta.
 *
 * ⚠️ O `context` da sessão é jsonb persistido: só ids opacos (`operatorTripId`, `operatorDocumentId`)
 * e marcadores de passo (`separate`/`load`/`occurrence`, página) — nunca placa, nome de destinatário
 * ou qualquer outro dado que precise ser lido de novo a cada renderização (D8).
 */
import type { TripTransitionBlock } from '../../trips/domain/trip-state.policy.js'

export const OPERATOR_FLOW_ACTION_KIND = {
  actionRouter: 'operator.action_router',
  completeOccurrence: 'operator.complete_occurrence',
  dispatchConfirmRouter: 'operator.dispatch_confirm_router',
  documentRouter: 'operator.document_router',
  listDocuments: 'operator.list_documents',
  listOccurrenceTypes: 'operator.list_occurrence_types',
  listTrips: 'operator.list_trips',
  notePrompt: 'operator.note_prompt',
  noteRouter: 'operator.note_router',
  occurrenceTypeRouter: 'operator.occurrence_type_router',
  /** Spec 161 T15 (RF18): pede a foto — sai no lugar de `noteRouter` completar direto. */
  photoPrompt: 'operator.photo_prompt',
  /** Spec 161 T15 (RF18b/RF18c/RF19/RF20): baixa, valida, grava e decide o próximo passo. */
  photoRouter: 'operator.photo_router',
  tripActionMenu: 'operator.trip_action_menu',
  tripRouter: 'operator.trip_router',
} as const

export const OPERATOR_FLOW_NODE = {
  actionEntry: 'operator_action_entry',
  actionRouter: 'operator_action_router',
  dispatchConfirmMenu: 'operator_dispatch_confirm_menu',
  dispatchConfirmRouter: 'operator_dispatch_confirm_router',
  documentEntry: 'operator_document_entry',
  documentRouter: 'operator_document_router',
  listDocuments: 'operator_list_documents',
  listOccurrenceTypes: 'operator_list_occurrence_types',
  listTrips: 'operator_list_trips',
  noteEntry: 'operator_note_entry',
  notePrompt: 'operator_note_prompt',
  noteRouter: 'operator_note_router',
  occurrenceTypeEntry: 'operator_occurrence_type_entry',
  occurrenceTypeRouter: 'operator_occurrence_type_router',
  photoEntry: 'operator_occurrence_photo_entry',
  photoPrompt: 'operator_occurrence_photo_prompt',
  photoRouter: 'operator_occurrence_photo_router',
  tripActionMenu: 'operator_trip_action_menu',
  tripEntry: 'operator_trip_entry',
  tripRouter: 'operator_trip_router',
} as const

/** `separate`/`load`/`occurrence` — o passo escolhido no menu de ações da viagem; `dispatch` sai
 * direto para a confirmação, sem lista de notas. */
export const OPERATOR_FLOW_CONTEXT_KEY = {
  actionAnswer: 'operatorActionAnswer',
  actionChoice: 'operatorActionChoice',
  dispatchConfirmAnswer: 'operatorDispatchConfirmAnswer',
  documentAnswer: 'operatorDocumentAnswer',
  documentId: 'operatorDocumentId',
  listPage: 'operatorListPage',
  noteAnswer: 'operatorNoteAnswer',
  occurrenceTypeAnswer: 'operatorOccurrenceTypeAnswer',
  occurrenceTypeId: 'operatorOccurrenceTypeId',
  /** Spec 161 T15 (RF19): a ocorrência já registrada pela primeira foto — presente só a partir
   * daí, nunca gravada com id `undefined`/vazio (D6, nunca placa/nome, só o id opaco). */
  occurrenceId: 'operatorOccurrenceId',
  /** Spec 161 T15 (RF18c): quantas fotos já foram anexadas nesta ocorrência — a mensagem do passo
   * usa este número; o teto de verdade continua no banco (T1/T7). */
  photoCount: 'operatorOccurrencePhotoCount',
  /** Spec 161 T15 (RF18b): resposta que não é imagem nem um dos dois botões — conta para o
   * handoff (D8), separado do contador genérico do despachante (que o driver zera a cada turno
   * antes de qualquer `FlowActionHandler` rodar, e por isso não serve para um passo com mais de
   * um turno). */
  photoInvalidAttempts: 'operatorOccurrencePhotoInvalidAttempts',
  /** A resposta crua do passo de foto — texto ou id de botão; a imagem em si nunca passa por
   * aqui (T14: viaja por `WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY`, não pelo `userAnswer`). */
  photoAnswer: 'operatorOccurrencePhotoAnswer',
  tripAnswer: 'operatorTripAnswer',
  tripId: 'operatorTripId',
} as const

export const OPERATOR_OCCURRENCE_PHOTO_ANSWER = {
  cancel: 'occurrence_photo_cancel',
  done: 'occurrence_photo_done',
} as const

/** Id da linha "Todas as pendentes" do lote — nunca digitável por coincidência (D8). */
export const OPERATOR_BATCH_ALL_ANSWER = 'all_pending'

/** Id do botão "Pular" da observação da ocorrência, mesmo padrão do ramo do motorista. */
export const OPERATOR_NOTE_SKIP_ANSWER = 'skip'

/** ADR-0043/espelha `registerOccurrenceSchema.note`: confirmado em 500. */
export const OPERATOR_OCCURRENCE_NOTE_MAX_LENGTH = 500

export const OPERATOR_DISPATCH_CONFIRM_ANSWER = {
  cancel: 'cancel_dispatch',
  confirm: 'confirm_dispatch',
} as const

/** pt-BR do `TRIP_TRANSITION_BLOCK` (`trip-state.policy.ts`) — o operador nunca lê código em inglês. */
export const OPERATOR_TRANSITION_BLOCK_MESSAGES: Readonly<Record<TripTransitionBlock, string>> = {
  TRIP_ALREADY_DISPATCHED: 'A viagem já está na rua e não aceita mais mudanças por aqui.',
  TRIP_CANCELLED: 'Esta viagem foi cancelada.',
  TRIP_COMPLETED: 'Esta viagem já foi concluída.',
  TRIP_DOCUMENT_ALREADY_CLOSED: 'Esta nota já foi entregue ou devolvida.',
  TRIP_DOCUMENT_NOT_LOADED: 'Esta nota ainda não foi carregada.',
  TRIP_DOCUMENT_NOT_SEPARATED: 'Esta nota ainda não foi separada.',
  TRIP_HAS_NO_ROUTE: 'A viagem não tem roteiro planejado.',
  TRIP_NOT_DISPATCHED: 'A viagem ainda não foi despachada.',
  TRIP_ROUTE_NOT_PLANNED: 'O roteiro da viagem ainda não foi planejado.',
} as const

/**
 * Spec 185 (D4, ADR-0074 §1/§2): o desfecho do gatilho automático depois de carregar (linha, lote)
 * ou de registrar a ocorrência que libera a última pendente — sempre uma mensagem à parte, depois
 * da confirmação da própria escrita (§5 de `conversation-flow.md`, uma ideia por mensagem).
 */
export const OPERATOR_AUTO_DISPATCH_DISPATCHED_MESSAGE = 'Viagem despachada. 🚚'

export const OPERATOR_AUTO_DISPATCH_BLOCKED_MESSAGES: Readonly<
  Record<'TRIP_HAS_NO_ROUTE' | 'TRIP_HAS_UNSCHEDULED_STOPS', string>
> = {
  TRIP_HAS_NO_ROUTE: 'A viagem não saiu: há nota sem parada.',
  TRIP_HAS_UNSCHEDULED_STOPS: 'A viagem não saiu: parada aguardando agendamento.',
} as const
