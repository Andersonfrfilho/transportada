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
  PAYLOAD_TOO_LARGE: 'eventQueue.cause.tooLarge',
  TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED: 'eventQueue.cause.declaredAmountRequired',
  TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET: 'eventQueue.cause.itemsMinimumNotMet',
  TRIP_OCCURRENCE_ITEMS_REQUIRED: 'eventQueue.cause.itemsRequired',
  TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED: 'eventQueue.cause.referenceNumberRequired',
  TRIP_DELIVERY_PROOF_TOO_LARGE: 'eventQueue.cause.tooLarge',
  TRIP_NOT_OF_DRIVER: 'eventQueue.cause.notOfDriver',
  TRIP_STOP_NOT_REACHABLE: 'eventQueue.cause.stopNotReachable',
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
