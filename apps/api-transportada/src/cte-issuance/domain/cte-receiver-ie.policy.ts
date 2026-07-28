/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteReceiverIeIndicator } from '../../database/cte-emission-profile.schema.js'

import {
  CtePayloadReceiverIeUnavailableError,
  CtePayloadUnsupportedTakerError,
} from './cte-payload.error.js'
import type { CtePayloadInvoice, CtePayloadParty, CtePayloadProfile } from './cte-payload.types.js'

const EXEMPT_STATE_REGISTRATION = 'ISENTO'
const CPF_LENGTH = 11
const TAXPAYER_INDICATOR: CteReceiverIeIndicator = '1'
const EXEMPT_INDICATOR: CteReceiverIeIndicator = '2'
const NON_TAXPAYER_INDICATOR: CteReceiverIeIndicator = '9'

export function resolveTakerParty(
  input: Readonly<{ invoice: CtePayloadInvoice; profile: CtePayloadProfile }>,
): CtePayloadParty {
  if (input.profile.taker === '0') return input.invoice.sender
  if (input.profile.taker === '3') return input.invoice.recipient

  throw new CtePayloadUnsupportedTakerError(input.profile.taker)
}

export function resolveReceiverIeIndicator(
  input: Readonly<{ invoice: CtePayloadInvoice; profile: CtePayloadProfile }>,
): CteReceiverIeIndicator {
  const taker = resolveTakerParty(input)
  const stateRegistration = taker.stateRegistration?.trim() ?? ''
  if (stateRegistration.toUpperCase() === EXEMPT_STATE_REGISTRATION) return EXEMPT_INDICATOR
  if (stateRegistration.length > 0) return TAXPAYER_INDICATOR
  if (taker.taxId.length === CPF_LENGTH) return NON_TAXPAYER_INDICATOR
  if (input.profile.receiverIeIndicator === TAXPAYER_INDICATOR) {
    throw new CtePayloadReceiverIeUnavailableError()
  }

  return input.profile.receiverIeIndicator
}
