/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF6: when the operator may resend the request to the contractor. Only a reply that still
 * waits for the contractor (`awaiting_contractor`, `overdue`) can be resent, and at most once per alert
 * interval of the reply (`config.alertIntervalMinutes`, the copy made when the reply opened).
 */
import {
  CONTRACTOR_REPLY_WAITING_STATUSES,
  type ContractorReplyStatus,
} from '../../shared/occurrence-contractor-reply.constant.js'

const MILLISECONDS_PER_MINUTE = 60_000

/** The fixed product text that opens the resent mail; the original request follows it. */
export const CONTRACTOR_REPLY_RESEND_LEAD_TEXT = 'Reenvio do pedido abaixo.'

export type ContractorReplyResendBlockedReason = 'not_waiting' | 'too_soon'

export type ContractorReplyResendDecision =
  | { readonly kind: 'allowed' }
  | {
      readonly availableAt: Date | null
      readonly kind: 'blocked'
      readonly reason: ContractorReplyResendBlockedReason
    }

export function decideResend(input: {
  readonly alertIntervalMinutes: number
  readonly lastResendAt: Date | null
  readonly now: Date
  readonly status: ContractorReplyStatus
}): ContractorReplyResendDecision {
  const waitingStatuses: readonly ContractorReplyStatus[] = CONTRACTOR_REPLY_WAITING_STATUSES
  if (!waitingStatuses.includes(input.status)) {
    return { availableAt: null, kind: 'blocked', reason: 'not_waiting' }
  }
  if (input.lastResendAt === null) return { kind: 'allowed' }

  const availableAt = new Date(
    input.lastResendAt.getTime() + input.alertIntervalMinutes * MILLISECONDS_PER_MINUTE,
  )
  if (input.now.getTime() < availableAt.getTime()) {
    return { availableAt, kind: 'blocked', reason: 'too_soon' }
  }
  return { kind: 'allowed' }
}

export function buildResendBodyText(originalBodyText: string): string {
  return `${CONTRACTOR_REPLY_RESEND_LEAD_TEXT}\n\n${originalBodyText.trim()}`
}
