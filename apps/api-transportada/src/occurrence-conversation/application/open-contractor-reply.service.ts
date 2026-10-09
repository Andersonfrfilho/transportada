/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF1/D8: in the transaction of the automatic request, opens the contractor reply with the
 * effective configuration copied. A configuration that cannot be opened never blocks the request:
 * the request is the contractor's notice, and the reply is only what waits for the answer.
 */
import { resolveContractorReplyConfiguration } from '../domain/contractor-reply-configuration.policy.js'
import type { OccurrenceMailTransactionPort } from './occurrence-mail.port.js'

const MILLISECONDS_PER_HOUR = 3_600_000

export type OpenContractorReplyLogger = {
  warn(event: string, fields?: Record<string, unknown>): void
}

export async function openContractorReplyWhenConfigured(params: {
  readonly companyId: string
  readonly contractorId: string
  readonly conversationId: string
  readonly logger: OpenContractorReplyLogger | undefined
  readonly now: Date
  readonly occurrenceId: string
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<void> {
  const { companyId, occurrenceId, transaction } = params
  const stored = await transaction.findContractorReplyConfiguration({
    companyId,
    contractorId: params.contractorId,
    occurrenceId,
  })
  if (stored === null) return

  const decision = resolveContractorReplyConfiguration(stored)
  if (decision.kind === 'skip') {
    if (decision.reason === 'invalid_configuration') {
      params.logger?.warn('occurrence_contractor_reply_configuration_invalid', {
        companyId,
        occurrenceId,
      })
    }
    return
  }

  const { configuration } = decision
  await transaction.openContractorReply({
    companyId,
    configuration,
    conversationId: params.conversationId,
    deadlineAt:
      configuration.waitHours === null
        ? null
        : new Date(params.now.getTime() + configuration.waitHours * MILLISECONDS_PER_HOUR),
    occurrenceId,
  })
}
