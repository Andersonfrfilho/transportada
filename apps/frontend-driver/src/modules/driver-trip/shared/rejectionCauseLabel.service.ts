/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTripErrorDetail } from './offlineQueue.service'

/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 212: a causa gravada é `"<status> <código>"` (`toAttachmentSendOutcome`). Os códigos daqui
 * ganham texto humano na `/fila`; o resto segue cru, como sempre.
 *
 * Spec 217 (D7): `TRIP_NOT_OF_DRIVER` (403) e `TRIP_STOP_NOT_REACHABLE` (404) são exatamente o que
 * a API responde para quem saiu da tripulação — a fila já recusa certo (`offlineQueue.service.ts`),
 * só faltava o texto.
 */
const REJECTION_CAUSE_LABEL_KEYS: Readonly<Record<string, string>> = {
  OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT: 'eventQueue.cause.itemQuantityAboveNote',
  /** Spec 270 (ADR-0107, RF7): o tipo mudou de escopo enquanto o registro esperava na fila. */
  OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR: 'eventQueue.cause.typeNotAvailableForContractor',
  TRIP_OCCURRENCE_ALREADY_OPEN_FOR_TYPE: 'eventQueue.cause.alreadyOpenForType',
  TRIP_OCCURRENCE_MIN_WAIT_NOT_REACHED: 'eventQueue.cause.minWaitNotReached',
  TRIP_OCCURRENCE_NOTE_REQUIRED: 'eventQueue.cause.noteRequired',
  TRIP_OCCURRENCE_ATTACHMENT_REQUIRED: 'eventQueue.cause.attachmentRequired',
  OCCURRENCE_PHOTO_REQUIRED: 'eventQueue.cause.photoRequired',
  TRIP_OCCURRENCE_PHOTO_MINIMUM_NOT_MET: 'eventQueue.cause.photoMinimumNotMet',
  TRIP_OCCURRENCE_SIGNATURE_REQUIRED: 'eventQueue.cause.signatureRequired',
  TRIP_OCCURRENCE_LOCATION_REQUIRED: 'eventQueue.cause.locationRequired',
  TRIP_OCCURRENCE_ARRIVAL_TIME_REQUIRED: 'eventQueue.cause.arrivalTimeRequired',
  TRIP_OCCURRENCE_DUPLICATE_REQUEST: 'eventQueue.cause.duplicateRequest',
  TRIP_OCCURRENCE_UPLOAD_NOT_REACHABLE: 'eventQueue.cause.uploadNotReachable',
  TRIP_OCCURRENCE_ATTACHMENT_LIMIT: 'eventQueue.cause.attachmentLimit',
  DELIVERY_CLIENT_NOT_RESOLVED: 'eventQueue.cause.deliveryClientNotResolved',
  STOP_OCCURRENCE_PHOTO_SLOT_MISSING: 'eventQueue.cause.photoSlotMissing',
  STOP_OCCURRENCE_PHOTO_SLOT_INVALID: 'eventQueue.cause.photoSlotInvalid',
  STOP_OCCURRENCE_PAID_BY_REQUIRED: 'eventQueue.cause.paidByRequired',
  STOP_OCCURRENCE_DRIVER_PIX_REQUIRED: 'eventQueue.cause.driverPixRequired',
  STOP_OCCURRENCE_DOCUMENT_REQUIRED: 'eventQueue.cause.stopDocumentRequired',
  STOP_OCCURRENCE_DOCUMENT_NOT_IN_STOP: 'eventQueue.cause.documentNotInStop',
  STOP_OCCURRENCE_CHARGE_GROUP_MIXED_PARTIES: 'eventQueue.cause.chargeMixedParties',
  STOP_OCCURRENCE_RECEIVING_CHARGE_NOT_ACCEPTED: 'eventQueue.cause.chargeNotAccepted',
  TRIP_STOP_OUT_OF_ORDER: 'eventQueue.cause.stopOutOfOrder',
  DOCUMENT_ALREADY_SETTLED: 'eventQueue.cause.documentAlreadySettled',
  TRIP_DOCUMENT_ALREADY_DELIVERED: 'eventQueue.cause.documentAlreadyDelivered',
  DRIVER_TRIP_NOT_ACTIVE: 'eventQueue.cause.tripNotActive',
  DRIVER_NOT_REGISTERED: 'eventQueue.cause.driverNotRegistered',
  DELIVERED_AT_IN_FUTURE: 'eventQueue.cause.timeInFuture',
  ARRIVED_AT_IN_FUTURE: 'eventQueue.cause.timeInFuture',
  RETURNED_AT_IN_FUTURE: 'eventQueue.cause.timeInFuture',
  OCCURRENCE_CANCELLED: 'eventQueue.cause.occurrenceCancelled',
  TRIP_CLOSED: 'eventQueue.cause.tripClosed',
  TRIP_TRAILER_REQUIRED: 'eventQueue.cause.trailerRequired',
  TRIP_HAS_STOP_EN_ROUTE: 'eventQueue.cause.stopEnRoute',
  OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE: 'eventQueue.cause.itemQuantityNotPositive',
  OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT: 'eventQueue.cause.productNotInDocument',
  TRIP_DELIVERY_PROOF_ALREADY_CAPTURED: 'eventQueue.cause.proofAlreadyCaptured',
  TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED: 'eventQueue.cause.receiverNameRequired',
  TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED: 'eventQueue.cause.receivedByRequired',
  TRIP_DOCUMENT_RETURN_REASON_REQUIRED: 'eventQueue.cause.returnReasonRequired',
  PAYLOAD_TOO_LARGE: 'eventQueue.cause.tooLarge',
  TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED: 'eventQueue.cause.declaredAmountRequired',
  TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET: 'eventQueue.cause.itemsMinimumNotMet',
  TRIP_OCCURRENCE_ITEMS_REQUIRED: 'eventQueue.cause.itemsRequired',
  TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED: 'eventQueue.cause.referenceNumberRequired',
  TRIP_DELIVERY_PROOF_TOO_LARGE: 'eventQueue.cause.tooLarge',
  /** Spec 294 RF26: a nota já tem outro canhoto; a tela da viagem pergunta trocar ou manter. */
  TRIP_CANHOTO_ALREADY_ATTACHED: 'eventQueue.cause.canhotoAlreadyAttached',
  /** O despacho que o servidor recusa por nota não carregada ou parada sem horário: só o escritório destrava. */
  TRIP_HAS_UNLOADED_DOCUMENTS: 'eventQueue.cause.unloadedDocuments',
  TRIP_HAS_UNSCHEDULED_STOPS: 'eventQueue.cause.unscheduledStops',
  TRIP_NOT_OF_DRIVER: 'eventQueue.cause.notOfDriver',
  TRIP_STOP_NOT_REACHABLE: 'eventQueue.cause.stopNotReachable',
}

/** Código de erro do servidor sem texto cadastrado: a tela diz que foi recusado e guarda o código para o suporte. */
export function resolveUnknownRejectionCode(cause: string): string | undefined {
  const code = resolveRejectionCauseCode(cause)
  return /^[A-Z][A-Z0-9_]{2,}$/u.test(code) ? code : undefined
}

/** Spec 206 RF8b: o mesmo split, exposto — o "recusado por X" precisa comparar o código, não o texto. */
export function resolveRejectionCauseCode(cause: string): string {
  return cause.split(' ').at(-1) ?? cause
}

/** Spec 247: o campo que faltou, no `details[].field` do servidor — `items[0].declaredAmount` é o de um produto. */
const ITEM_FIELD_PREFIX = 'items['
const DECLARED_AMOUNT_REQUIRED_CODE = 'TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED'

export function resolveRejectionCauseLabelKey(
  cause: string,
  details?: readonly DriverTripErrorDetail[],
): string | undefined {
  const code = resolveRejectionCauseCode(cause)
  const isItemField = details?.some((detail) => detail.field.startsWith(ITEM_FIELD_PREFIX)) === true
  if (code === DECLARED_AMOUNT_REQUIRED_CODE && isItemField) {
    return 'eventQueue.cause.itemDeclaredAmountRequired'
  }
  return REJECTION_CAUSE_LABEL_KEYS[code]
}
