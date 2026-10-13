/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: reads the configuration that governs the reply of one occurrence and opens the reply, both
 * inside the transaction of the automatic request. Every read and write carries `company_id`.
 */
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
  occurrenceConversationAttachments,
  tripDocumentOccurrences,
} from '../../database/database.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { StoredContractorReplyConfiguration } from '../application/occurrence-mail.port.js'
import type { ContractorReplyConfiguration } from '../domain/contractor-reply-configuration.policy.js'
import { decideContractorReply } from '../domain/contractor-reply.policy.js'
import {
  deliverContractorReplyToDriver,
  type DeliverContractorReplyToDriverResult,
} from './contractor-reply-driver-delivery.support.js'
import { queueContractorReplyToNoteRecipient } from './contractor-reply-note-recipient-forward.support.js'

export type ContractorReplyAutomaticDelivery = Extract<
  DeliverContractorReplyToDriverResult,
  { readonly kind: 'delivered' }
>

export async function findContractorReplyConfiguration(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly contractorId: string
    readonly occurrenceId: string
  },
): Promise<StoredContractorReplyConfiguration | null> {
  const [row] = await queryable
    .select({
      overrideForwardToNoteRecipient:
        companyOccurrenceTypeContractorOverrides.forwardToNoteRecipient,
      overrideId: companyOccurrenceTypeContractorOverrides.id,
      overrideMode: companyOccurrenceTypeContractorOverrides.contractorReplyMode,
      overrideWaitHours: companyOccurrenceTypeContractorOverrides.contractorReplyWaitHours,
      type: companyOccurrenceTypes,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .leftJoin(
      companyOccurrenceTypeContractorOverrides,
      and(
        eq(companyOccurrenceTypeContractorOverrides.companyId, tripDocumentOccurrences.companyId),
        eq(
          companyOccurrenceTypeContractorOverrides.occurrenceTypeId,
          tripDocumentOccurrences.occurrenceTypeId,
        ),
        eq(companyOccurrenceTypeContractorOverrides.contractorId, params.contractorId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, params.companyId),
        eq(tripDocumentOccurrences.id, params.occurrenceId),
      ),
    )
    .limit(1)
  if (row === undefined) return null

  const { type } = row
  return {
    override:
      row.overrideId === null
        ? null
        : {
            forwardToNoteRecipient: row.overrideForwardToNoteRecipient,
            mode: row.overrideMode,
            waitHours: row.overrideWaitHours,
          },
    type: {
      alertIntervalMinutes: type.contractorReplyAlertIntervalMinutes,
      alertMaxCount: type.contractorReplyAlertMaxCount,
      alertMode: type.contractorReplyAlertMode,
      attachmentKind: type.contractorReplyAttachmentKind,
      driverReplyChannel: type.driverReplyChannel,
      driverReplyTemplate: type.driverReplyTemplate,
      driverReplyWindowClosedAction: type.driverReplyWindowClosedAction,
      emailsContractor: type.emailsContractor,
      forwardEmailBody: type.forwardEmailBody,
      forwardEmailSubject: type.forwardEmailSubject,
      forwardToInformedEmail: type.forwardToInformedEmail,
      forwardToNoteRecipient: type.forwardToNoteRecipient,
      mode: type.contractorReplyMode,
      waitHours: type.contractorReplyWaitHours,
    },
  }
}

export async function openContractorReply(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly configuration: ContractorReplyConfiguration
    readonly conversationId: string
    readonly deadlineAt: Date | null
    readonly occurrenceId: string
  },
): Promise<void> {
  await queryable
    .insert(occurrenceContractorReplies)
    .values({
      companyId: params.companyId,
      config: params.configuration,
      conversationId: params.conversationId,
      deadlineAt: params.deadlineAt,
      occurrenceId: params.occurrenceId,
      status: 'awaiting_contractor',
    })
    .onConflictDoNothing({
      target: [occurrenceContractorReplies.companyId, occurrenceContractorReplies.occurrenceId],
    })
}

/**
 * Moves the open reply of the conversation by the message that just arrived; any other state is left alone.
 * Returns the delivery only when this call wrote to the driver chat (T4.6b), so the caller notifies after the commit.
 */
export async function applyContractorReplyToMessage(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
    readonly now: Date
  },
): Promise<ContractorReplyAutomaticDelivery | undefined> {
  const { companyId } = params
  const [reply] = await queryable
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

  const attachments = await queryable
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
      config: reply.config as ContractorReplyConfiguration,
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
  await queryable
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
  await queryable.insert(occurrenceContractorReplyEvents).values({
    actorKind: 'system',
    companyId,
    fromStatus: reply.status,
    reason,
    replyId: reply.id,
    toStatus,
  })

  /** RF4/RF7: modo automático — a resposta aceita segue ao motorista na mesma transação (idempotente). */
  if (toStatus !== 'reply_received') return undefined
  const delivery = await deliverContractorReplyToDriver(queryable, {
    actorUserId: null,
    companyId,
    now: params.now,
    replyId: reply.id,
    trigger: 'automatic',
  })
  /** RF10: o mesmo boleto sai ao cliente da nota quando o tipo liga o envio automático; falha dele não desfaz nada acima. */
  await queueContractorReplyToNoteRecipient(queryable, { companyId, replyId: reply.id })
  return delivery.kind === 'delivered' ? delivery : undefined
}
