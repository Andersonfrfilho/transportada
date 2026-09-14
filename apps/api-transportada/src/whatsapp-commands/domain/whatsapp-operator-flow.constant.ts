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
  tripAnswer: 'operatorTripAnswer',
  tripId: 'operatorTripId',
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
