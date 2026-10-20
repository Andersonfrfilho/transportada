/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF7/RF9 (T4.6): o operador leva o boleto da contratante ao motorista pelo chat do app — a resposta
 * aceita do retorno ou qualquer anexo da conversa da contratante. O aviso no sino sai só depois do commit e
 * nunca desfaz a entrega. Ocorrência sem retorno leva o anexo escolhido assim mesmo (o botão aparece em todo
 * arquivo recebido); sem retorno e sem anexo escolhido não há o que levar: 404.
 */
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'
import type { DriverConversationNotifierPort } from './driver-conversation.port.js'
import type {
  DeliverContractorReplyToDriverParams,
  DeliverContractorReplyToDriverResult,
} from '../infrastructure/contractor-reply-driver-delivery.support.js'
import type { DeliverConversationAttachmentToDriverParams } from '../infrastructure/conversation-attachment-driver-delivery.support.js'

export type ContractorReplyDeliveryTransactionPort = {
  deliver(
    params: DeliverContractorReplyToDriverParams,
  ): Promise<DeliverContractorReplyToDriverResult>
  deliverAttachment(
    params: DeliverConversationAttachmentToDriverParams,
  ): Promise<DeliverContractorReplyToDriverResult>
  findOccurrenceLabel(input: { companyId: string; occurrenceId: string }): Promise<null | string>
  findReplyId(input: { companyId: string; occurrenceId: string }): Promise<null | string>
}

export type ContractorReplyDeliveryUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: ContractorReplyDeliveryTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type DeliverContractorReplyToDriverOutcome =
  | { readonly kind: 'already_delivered' }
  | { readonly kind: 'delivered'; readonly conversationMessageId: string }
  | { readonly kind: 'skipped'; readonly reason: string }

export function createDeliverContractorReplyToDriverUseCase(dependencies: {
  readonly clock: () => Date
  readonly notifier: DriverConversationNotifierPort
  readonly unitOfWork: ContractorReplyDeliveryUnitOfWorkPort
}) {
  return {
    async deliver(input: {
      readonly actorUserId: string
      readonly attachmentId?: string
      readonly companyId: string
      readonly occurrenceId: string
    }): Promise<DeliverContractorReplyToDriverOutcome> {
      const outcome = await dependencies.unitOfWork.execute(async (transaction) => {
        const replyId = await transaction.findReplyId(input)
        if (replyId === null && input.attachmentId === undefined) {
          throw new TripOccurrenceNotFoundError()
        }
        const result =
          replyId === null
            ? await transaction.deliverAttachment({
                actorUserId: input.actorUserId,
                attachmentId: input.attachmentId ?? '',
                companyId: input.companyId,
                now: dependencies.clock(),
                occurrenceId: input.occurrenceId,
              })
            : await transaction.deliver({
                actorUserId: input.actorUserId,
                ...(input.attachmentId === undefined ? {} : { attachmentId: input.attachmentId }),
                companyId: input.companyId,
                now: dependencies.clock(),
                replyId,
                trigger: 'operator',
              })
        const occurrenceLabel =
          result.kind === 'delivered' ? await transaction.findOccurrenceLabel(input) : null
        return { occurrenceLabel, result }
      })

      const { result } = outcome
      if (result.kind === 'already_delivered') return { kind: 'already_delivered' }
      if (result.kind === 'skipped') return { kind: 'skipped', reason: result.reason }

      try {
        await dependencies.notifier.notify({
          companyId: input.companyId,
          dedupeKey: result.driverMessageId,
          occurrenceLabel: outcome.occurrenceLabel ?? '',
          protocol: result.protocol,
          recipientUserId: result.driverUserId,
          subjectId: result.occurrenceId,
          subjectType: OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE,
        })
      } catch {
        // O notificador registra a própria falha; o boleto já está na conversa.
      }
      return { conversationMessageId: result.driverMessageId, kind: 'delivered' }
    },
  }
}
