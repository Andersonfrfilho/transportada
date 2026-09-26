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
  PAYLOAD_TOO_LARGE: 'eventQueue.cause.tooLarge',
  TRIP_DELIVERY_PROOF_TOO_LARGE: 'eventQueue.cause.tooLarge',
  TRIP_NOT_OF_DRIVER: 'eventQueue.cause.notOfDriver',
  TRIP_STOP_NOT_REACHABLE: 'eventQueue.cause.stopNotReachable',
}

/** Spec 206 RF8b: o mesmo split, exposto — o "recusado por X" precisa comparar o código, não o texto. */
export function resolveRejectionCauseCode(cause: string): string {
  return cause.split(' ').at(-1) ?? cause
}

export function resolveRejectionCauseLabelKey(cause: string): string | undefined {
  return REJECTION_CAUSE_LABEL_KEYS[resolveRejectionCauseCode(cause)]
}
