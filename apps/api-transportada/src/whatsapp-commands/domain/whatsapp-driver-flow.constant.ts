/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T015 — o ramo "Minha viagem" do motorista. Ids de nó, `actionKind` e chaves de contexto
 * do fluxo, num lugar só — o grafo (`whatsapp-flow-graph.constant.ts`) e as `FlowAction`s
 * (`register-driver-flow-actions.ts`) importam daqui, nunca redeclaram a string solta.
 *
 * ⚠️ O `context` da sessão é jsonb persistido: só ids opacos (`tripId`, `documentId`) e marcadores
 * de passo (`deliver`/`return`/`occurrence`, motivo, página) — nunca nome de destinatário nem
 * qualquer outro dado que precise ser lido de novo a cada renderização (D8).
 */
import type { TripTransitionBlock } from '../../trips/domain/trip-state.policy.js'

export const DRIVER_FLOW_ACTION_KIND = {
  completeOccurrence: 'driver.complete_occurrence',
  completeReturn: 'driver.complete_return',
  currentTrip: 'driver.current_trip',
  documentRouter: 'driver.document_router',
  listDocuments: 'driver.list_documents',
  listOccurrenceTypes: 'driver.list_occurrence_types',
  notePrompt: 'driver.note_prompt',
  noteRouter: 'driver.note_router',
  occurrenceTypeRouter: 'driver.occurrence_type_router',
} as const

export const DRIVER_FLOW_NODE = {
  currentTrip: 'driver_current_trip',
  documentEntry: 'driver_document_entry',
  documentRouter: 'driver_document_router',
  listDocuments: 'driver_list_documents',
  listOccurrenceTypes: 'driver_list_occurrence_types',
  noteEntry: 'driver_note_entry',
  notePrompt: 'driver_note_prompt',
  noteRouter: 'driver_note_router',
  occurrenceTypeEntry: 'driver_occurrence_type_entry',
  occurrenceTypeRouter: 'driver_occurrence_type_router',
  returnReasonMenu: 'driver_return_reason_menu',
  returnReasonRouter: 'driver_return_reason_router',
  tripMenu: 'driver_trip_menu',
} as const

/** `deliver`/`return`/`occurrence` — nunca PII, só o passo escolhido no menu da viagem. */
export const DRIVER_FLOW_CONTEXT_KEY = {
  documentAnswer: 'driverDocumentAnswer',
  documentId: 'driverDocumentId',
  listPage: 'driverListPage',
  noteAnswer: 'driverNoteAnswer',
  occurrenceTypeAnswer: 'driverOccurrenceTypeAnswer',
  occurrenceTypeId: 'driverOccurrenceTypeId',
  returnReason: 'driverReturnReason',
  tripId: 'driverTripId',
  tripMenuChoice: 'driverTripMenuChoice',
} as const

export const DRIVER_FLOW_STEP = {
  deliver: 'deliver',
  occurrence: 'occurrence',
  return: 'return',
} as const

export type DriverFlowStep = (typeof DRIVER_FLOW_STEP)[keyof typeof DRIVER_FLOW_STEP]

/** Id do botão "Pular" da observação da ocorrência — nunca digitável por coincidência (D8). */
export const DRIVER_NOTE_SKIP_ANSWER = 'skip'

/** ADR-0043/espelha `registerOccurrenceSchema.note` (`occurrence.schema.ts`): confirmado em 500. */
export const DRIVER_OCCURRENCE_NOTE_MAX_LENGTH = 500

export const DRIVER_RETURN_REASON_LABELS: Readonly<Record<string, string>> = {
  address_not_found: '📍 Endereço não achado',
  damaged_goods: '📦 Carga avariada',
  establishment_closed: '🔒 Local fechado',
  recipient_absent: '🚪 Destinatário ausente',
  recipient_refused: '🙅 Recusou receber',
}

/** pt-BR do `TRIP_TRANSITION_BLOCK` (`trip-state.policy.ts`) — o motorista nunca lê código em inglês. */
export const DRIVER_TRANSITION_BLOCK_MESSAGES: Readonly<Record<TripTransitionBlock, string>> = {
  TRIP_ALREADY_DISPATCHED: 'A viagem já está na rua e não aceita mais mudanças por aqui.',
  TRIP_CANCELLED: 'Esta viagem foi cancelada.',
  TRIP_COMPLETED: 'Esta viagem já foi concluída.',
  TRIP_CREW_ALREADY_DEFINED: 'A tripulação desta viagem já foi definida.',
  TRIP_CREW_NOT_DEFINED: 'Esta viagem ainda não tem motorista ou veículo definido.',
  TRIP_DOCUMENT_ALREADY_CLOSED: 'Esta nota já foi entregue ou devolvida.',
  TRIP_DOCUMENT_NOT_LOADED: 'Esta nota ainda não foi carregada.',
  TRIP_DOCUMENT_NOT_SEPARATED: 'Esta nota ainda não foi separada.',
  TRIP_HAS_NO_ROUTE: 'A viagem não tem roteiro planejado.',
  TRIP_NOT_DISPATCHED:
    'A viagem ainda não foi despachada — entregar e devolver só depois da saída.',
  TRIP_ROUTE_NOT_PLANNED: 'O roteiro da viagem ainda não foi planejado.',
}
