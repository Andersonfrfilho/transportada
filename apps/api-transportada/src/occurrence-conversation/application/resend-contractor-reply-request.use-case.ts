/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF6: "Reenviar o pedido à contratante". The request goes out again in the same e-mail
 * conversation, through the e-mail use case of the conversation, with the fixed product text first and
 * the original request below it. Whether it may go now (status, once per alert interval) is decided
 * inside the transaction of that mail, never here: a retry with the same `Idempotency-Key` must replay
 * the stored answer instead of meeting the interval it just started.
 */
import {
  ContractorReplyNotResendableError,
  ContractorReplyOriginalRequestMissingError,
} from '../domain/occurrence-conversation.error.js'
import { buildResendBodyText } from '../domain/contractor-reply-resend.policy.js'
import type { SendOccurrenceMailUseCase } from './send-occurrence-mail.use-case.js'

export type ContractorReplyResendContext = {
  /** The active contacts that own an address the original request went to. */
  readonly contactIds: readonly string[]
  /** `null` when the conversation holds no outbound mail (nothing to resend). */
  readonly original: {
    readonly bodyText: string
    readonly subject: string
    readonly toAddresses: readonly string[]
  } | null
}

export type ContractorReplyResendReaderPort = {
  /** `null`: the occurrence has no contractor reply in the company. */
  findContext(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyResendContext | null>
}

export type ResendContractorReplyRequestResult = {
  readonly conversationId: string
  readonly conversationMessageId: string
  readonly recipientCount: number
}

export function createResendContractorReplyRequestUseCase(dependencies: {
  readonly reader: ContractorReplyResendReaderPort
  readonly sendMail: Pick<SendOccurrenceMailUseCase, 'send'>
}) {
  return {
    async resend(input: {
      readonly actorUserId: string
      readonly companyId: string
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }): Promise<ResendContractorReplyRequestResult> {
      const context = await dependencies.reader.findContext({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (context === null) throw new ContractorReplyNotResendableError()
      if (context.original === null) throw new ContractorReplyOriginalRequestMissingError()

      const sent = await dependencies.sendMail.send({
        actorUserId: input.actorUserId,
        bodyText: buildResendBodyText(context.original.bodyText),
        companyId: input.companyId,
        contactIds: context.contactIds,
        contractorReplyResend: true,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        occurrenceId: input.occurrenceId,
        subject: context.original.subject,
      })
      return {
        conversationId: sent.conversationId,
        conversationMessageId: sent.conversationMessageId,
        recipientCount: sent.recipientCount,
      }
    },
  }
}
