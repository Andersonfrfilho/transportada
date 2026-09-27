/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 212: a causa gravada é `"<status> <código>"` (`toAttachmentSendOutcome`). Os códigos daqui
 * ganham texto humano na `/fila`; o resto segue cru, como sempre.
 */
const REJECTION_CAUSE_LABEL_KEYS: Readonly<Record<string, string>> = {
  PAYLOAD_TOO_LARGE: 'eventQueue.cause.tooLarge',
  TRIP_DELIVERY_PROOF_TOO_LARGE: 'eventQueue.cause.tooLarge',
}

export function resolveRejectionCauseLabelKey(cause: string): string | undefined {
  const code = cause.split(' ').at(-1) ?? cause
  return REJECTION_CAUSE_LABEL_KEYS[code]
}
