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
import type { DriverReturnReason } from '../../trips/domain/driver-return-reason.policy.js'
import type { TripTransitionBlock } from '../../trips/domain/trip-state.policy.js'
import type { MessageOption } from './whatsapp-message-format.policy.js'

export const DRIVER_FLOW_ACTION_KIND = {
  arrive: 'driver.arrive',
  completeOccurrence: 'driver.complete_occurrence',
  completeReturn: 'driver.complete_return',
  currentTrip: 'driver.current_trip',
  depart: 'driver.depart',
  directCommand: 'driver.direct_command',
  directConfirmRouter: 'driver.direct_confirm_router',
  documentRouter: 'driver.document_router',
  listDocuments: 'driver.list_documents',
  listOccurrenceTypes: 'driver.list_occurrence_types',
  listStops: 'driver.list_stops',
  notePrompt: 'driver.note_prompt',
  noteRouter: 'driver.note_router',
  occurrenceTypeRouter: 'driver.occurrence_type_router',
  stopRouter: 'driver.stop_router',
} as const

export const DRIVER_FLOW_NODE = {
  arrive: 'driver_arrive',
  currentTrip: 'driver_current_trip',
  depart: 'driver_depart',
  directCommand: 'driver_direct_command',
  directConfirm: 'driver_direct_confirm',
  directConfirmRouter: 'driver_direct_confirm_router',
  documentEntry: 'driver_document_entry',
  documentRouter: 'driver_document_router',
  listDocuments: 'driver_list_documents',
  listOccurrenceTypes: 'driver_list_occurrence_types',
  listStops: 'driver_list_stops',
  noteEntry: 'driver_note_entry',
  notePrompt: 'driver_note_prompt',
  noteRouter: 'driver_note_router',
  occurrenceTypeEntry: 'driver_occurrence_type_entry',
  occurrenceTypeRouter: 'driver_occurrence_type_router',
  returnReasonMenu: 'driver_return_reason_menu',
  returnReasonRouter: 'driver_return_reason_router',
  stopEntry: 'driver_stop_entry',
  stopRouter: 'driver_stop_router',
  tripMenu: 'driver_trip_menu',
} as const

/** `deliver`/`return`/`occurrence` — nunca PII, só o passo escolhido no menu da viagem. */
export const DRIVER_FLOW_CONTEXT_KEY = {
  /** Spec 293 T14: o comando direto lido do texto (`kind`, `numbers`, `reason`) — sem PII. */
  directCommand: 'driverDirectCommand',
  directConfirmAnswer: 'driverDirectConfirmAnswer',
  /** Ids opacos das notas aguardando o "1-Sim / 2-Não" do comando direto. */
  directDocumentIds: 'driverDirectDocumentIds',
  directEvent: 'driverDirectEvent',
  directReason: 'driverDirectReason',
  documentAnswer: 'driverDocumentAnswer',
  documentId: 'driverDocumentId',
  listPage: 'driverListPage',
  noteAnswer: 'driverNoteAnswer',
  occurrenceTypeAnswer: 'driverOccurrenceTypeAnswer',
  occurrenceTypeId: 'driverOccurrenceTypeId',
  returnReason: 'driverReturnReason',
  stopAnswer: 'driverStopAnswer',
  tripId: 'driverTripId',
  tripMenuChoice: 'driverTripMenuChoice',
} as const

/** Pedido não bloqueante: sem o ponto a baixa segue como `unavailable` (spec 196 T3.8). */
export const DRIVER_LOCATION_REQUEST_TEXT =
  '📍 _Se puder, mande sua localização antes de confirmar: clipe (anexo) 📎 → Localização → Enviar localização atual._'

export const DRIVER_FLOW_STEP = {
  arrive: 'arrive',
  deliver: 'deliver',
  depart: 'depart',
  occurrence: 'occurrence',
  return: 'return',
} as const

/** Spec 293 T14: respostas do "Confirma?" do comando direto (entregar/devolver sempre confirmam). */
export const DRIVER_DIRECT_CONFIRM_ANSWER = { no: 'no', yes: 'yes' } as const

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

/** Spec 300 (RF1): o motivo como opção numerada (ícone e ação), a partir do rótulo — a lista da Meta usa o rótulo inteiro. */
export function describeReturnReasonOption(reason: DriverReturnReason): MessageOption {
  const [icon = '', ...action] = (DRIVER_RETURN_REASON_LABELS[reason] ?? reason).split(' ')
  return { action: action.join(' '), icon }
}

/** pt-BR do `TRIP_TRANSITION_BLOCK` (`trip-state.policy.ts`) — o motorista nunca lê código em inglês. */
export const DRIVER_TRANSITION_BLOCK_MESSAGES: Readonly<Record<TripTransitionBlock, string>> = {
  TRIP_ALREADY_DISPATCHED: '🚫 *A viagem já está na rua.* Não aceita mais mudanças por aqui.',
  TRIP_CANCELLED: '🚫 *Esta viagem foi cancelada.*',
  TRIP_COMPLETED: '🚫 *Esta viagem já foi concluída.*',
  TRIP_SEPARATION_STARTED: '🚫 *A separação desta viagem já começou.* A tripulação não troca mais.',
  TRIP_CREW_NOT_DEFINED: '🚫 *Esta viagem ainda não tem motorista ou veículo definido.*',
  TRIP_DOCUMENT_ALREADY_CLOSED: '🚫 *Esta nota já foi entregue ou devolvida.*',
  TRIP_DOCUMENT_NOT_LOADED: '🚫 *Esta nota ainda não foi carregada.*',
  TRIP_DOCUMENT_NOT_SEPARATED: '🚫 *Esta nota ainda não foi separada.*',
  TRIP_HAS_NO_ROUTE: '🚫 *A viagem não tem roteiro planejado.*',
  TRIP_NOT_DISPATCHED:
    '🚫 *A viagem ainda não foi despachada.* Entregar e devolver só depois da saída.',
  TRIP_ROUTE_NOT_PLANNED: '🚫 *O roteiro da viagem ainda não foi planejado.*',
  TRIP_TRAILER_REQUIRED: '🚫 *O cavalo precisa de uma carreta atrelada antes de sair.*',
}

/**
 * Spec 299: uma entrega em preparo que ninguém mexe há tanto tempo é conversa esquecida (o pedido do grupo já
 * expirou). Passado esse tempo ela deixa de contar como "pergunta aberta" para o lembrete e para a leitura da foto.
 * Em 11/11/2026 a NF 918095 ficou 45 h aberta e segurou a cobrança do motorista.
 */
export const WHATSAPP_DELIVERY_PREPARATION_STALE_AFTER_MS = 6 * 60 * 60 * 1000
