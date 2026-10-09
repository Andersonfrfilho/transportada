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
import type { OccurrenceConversationTransaction } from './drizzle-occurrence-conversation-mail.repository.js'

export async function applyContractorReplyToMessage(
  transaction: OccurrenceConversationTransaction,
  params: {
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
    readonly now: Date
  },
): Promise<void> {
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
  if (reply === undefined) return

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
  if (decision.kind === 'ignore') return

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
}
