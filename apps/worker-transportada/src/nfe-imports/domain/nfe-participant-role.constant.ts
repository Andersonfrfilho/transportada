/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeXmlDocument, NfeXmlParty } from '@adatechnology/fiscal-provider'

export const NFE_PARTICIPANT_ROLE = {
  CARRIER: 'carrier',
  DELIVERY: 'delivery',
  EMITTER: 'emitter',
  PICKUP: 'pickup',
  RECIPIENT: 'recipient',
} as const

export type NfeParticipantRole = (typeof NFE_PARTICIPANT_ROLE)[keyof typeof NFE_PARTICIPANT_ROLE]

export function resolvePartyByRole(input: {
  readonly document: NfeXmlDocument
  readonly role: string
}): NfeXmlParty | undefined {
  switch (input.role) {
    case NFE_PARTICIPANT_ROLE.EMITTER:
      return input.document.issuer
    case NFE_PARTICIPANT_ROLE.RECIPIENT:
      return input.document.recipient
    case NFE_PARTICIPANT_ROLE.CARRIER:
      return input.document.carrier
    case NFE_PARTICIPANT_ROLE.PICKUP:
      return input.document.pickup
    case NFE_PARTICIPANT_ROLE.DELIVERY:
      return input.document.delivery
    default:
      return undefined
  }
}
