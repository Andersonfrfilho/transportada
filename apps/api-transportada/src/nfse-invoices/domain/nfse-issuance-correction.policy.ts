/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { NfseIssExigibility } from '../../database/nfse.schema.js'
import {
  MONEY_SCALE,
  PERCENTAGE_FACTOR,
  PERCENTAGE_SCALE,
  applyRate,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { NfseIssRateOutOfRangeError } from './nfse-issuance.error.js'

const ERROR_CODE_PREFIX = 'NFSE'

export type NfseInvoiceCorrectionInput = {
  readonly cnaeCode?: string | undefined
  readonly description?: string | undefined
  readonly issExigibility?: NfseIssExigibility | undefined
  readonly issRate?: string | undefined
  readonly issWithheld?: boolean | undefined
  readonly municipalTaxationCode?: string | undefined
  readonly municipalityIbgeCode?: string | undefined
  readonly nbsCode?: string | undefined
  readonly serviceListItem?: string | undefined
}

export type ApplyNfseIssuanceCorrectionInput = {
  readonly correction?: NfseInvoiceCorrectionInput
  readonly previousPayload: Readonly<Record<string, unknown>>
  readonly previousPayloadSha256: string
}

export type NfseIssuanceCorrectionResult = {
  readonly issAmount?: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly payloadSha256: string
}

/**
 * Correção pura sobre o payload congelado: sem corpo, devolve o mesmo payload e o mesmo hash —
 * é o que mantém T006 (reemissão sem correção) verde depois deste task.
 */
export function applyNfseIssuanceCorrection({
  correction,
  previousPayload,
  previousPayloadSha256,
}: ApplyNfseIssuanceCorrectionInput): NfseIssuanceCorrectionResult {
  if (correction === undefined || Object.keys(correction).length === 0) {
    return { payload: previousPayload, payloadSha256: previousPayloadSha256 }
  }

  const issAmount =
    correction.issRate === undefined
      ? undefined
      : recalculateIssAmount({
          issRate: correction.issRate,
          serviceAmount: String(previousPayload.serviceAmount),
        })

  const payload: Readonly<Record<string, unknown>> = {
    ...previousPayload,
    ...correction,
    ...(issAmount === undefined ? {} : { issAmount }),
  }

  return {
    ...(issAmount === undefined ? {} : { issAmount }),
    payload,
    payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  }
}

function recalculateIssAmount(input: {
  readonly issRate: string
  readonly serviceAmount: string
}): string {
  const rateScaled = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: PERCENTAGE_SCALE,
    value: input.issRate,
  })
  if (rateScaled > PERCENTAGE_FACTOR) throw new NfseIssRateOutOfRangeError()

  const amountScaled = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: MONEY_SCALE,
    value: input.serviceAmount,
  })

  return formatScaledDecimal(applyRate({ amountScaled, rateScaled }), MONEY_SCALE)
}
