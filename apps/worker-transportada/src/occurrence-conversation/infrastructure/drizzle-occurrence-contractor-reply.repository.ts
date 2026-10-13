/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.5: a resposta da contratante gravada na conversa move o retorno aberto dela, na mesma
 * transação da mensagem. Retorno em outro estado não muda; toda leitura e escrita leva `company_id`.
 * Nenhum log aqui: anexo e endereço nunca saem do banco.
 */
import { and, eq } from 'drizzle-orm'

import { occurrenceConversationAttachments } from '../../database/occurrence-conversation.schema.js'
import {
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
} from '../../database/occurrence-contractor-reply.schema.js'
import {
  decideContractorReply,
  type ContractorReplyDecisionInput,
} from '../domain/contractor-reply.policy.js'
import {
  deliverContractorReplyToDriver,
  type DeliverContractorReplyToDriverResult,
} from './contractor-reply-driver-delivery.support.js'
import type { OccurrenceConversationTransaction } from './drizzle-occurrence-conversation-mail.repository.js'

export type ContractorReplyAutomaticDelivery = Extract<
  DeliverContractorReplyToDriverResult,
  { readonly kind: 'delivered' }
>

/**
 * Returns the delivery only when this call wrote to the driver chat (T4.6b), so the caller notifies after the commit.
 */
export async function applyContractorReplyToMessage(
  transaction: OccurrenceConversationTransaction,
  params: {
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
    readonly now: Date
  },
): Promise<ContractorReplyAutomaticDelivery | undefined> {
  const { companyId } = params
  const [reply] = await transaction
    .select({
      config: occurrenceContractorReplies.config,
      id: occurrenceContractorReplies.id,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, companyId),
        eq(occurrenceContractorReplies.conversationId, params.conversationId),
      ),
    )
    .for('update')
    .limit(1)
  if (reply === undefined) return undefined

  const attachments = await transaction
    .select({
      contentType: occurrenceConversationAttachments.contentType,
      id: occurrenceConversationAttachments.id,
    })
    .from(occurrenceConversationAttachments)
    .where(
      and(
        eq(occurrenceConversationAttachments.companyId, companyId),
        eq(occurrenceConversationAttachments.messageId, params.messageId),
      ),
    )
  const decision = decideContractorReply({
    attachments,
    reply: {
      config: reply.config as ContractorReplyDecisionInput['reply']['config'],
      status: reply.status,
    },
  })
  if (decision.kind === 'ignore') return undefined

  const isAccepted = decision.kind === 'accept'
  const toStatus = isAccepted
    ? decision.nextStep === 'deliver'
      ? 'reply_received'
      : 'awaiting_operator'
    : 'needs_operator'
  const reason = isAccepted ? null : decision.reason
  await transaction
    .update(occurrenceContractorReplies)
    .set({
      reason,
      replyAttachmentId: isAccepted ? decision.attachmentId : null,
      replyMessageId: params.messageId,
      status: toStatus,
      updatedAt: params.now,
    })
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, companyId),
        eq(occurrenceContractorReplies.id, reply.id),
      ),
    )
  await transaction.insert(occurrenceContractorReplyEvents).values({
    actorKind: 'system',
    companyId,
    fromStatus: reply.status,
    reason,
    replyId: reply.id,
    toStatus,
  })

  /** RF4/RF7: modo automático — a resposta aceita segue ao motorista na mesma transação (idempotente). */
  if (toStatus !== 'reply_received') return undefined
  const delivery = await deliverContractorReplyToDriver(transaction, {
    actorUserId: null,
    companyId,
    now: params.now,
    replyId: reply.id,
    trigger: 'automatic',
  })
  return delivery.kind === 'delivered' ? delivery : undefined
}
