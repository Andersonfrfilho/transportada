/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF6: the resend of the request to the contractor. No table of its own: a resend is the `user`
 * event of a reply that stays in the same waiting status (`from_status = to_status`, no reason), the
 * only event of that shape (the handled action ends in `handled`, the system alerts are `system`). Every
 * read and write carries `company_id`.
 */
import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm'

import {
  contractorContacts,
  contractorMailMessages,
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/database.schema.js'
import { CONTRACTOR_REPLY_WAITING_STATUSES } from '../../shared/occurrence-contractor-reply.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { RecordContractorReplyResendOutcome } from '../application/occurrence-mail.port.js'
import type {
  ContractorReplyResendContext,
  ContractorReplyResendReaderPort,
} from '../application/resend-contractor-reply-request.use-case.js'
import { contractorReplyConfigurationSchema } from '../domain/contractor-reply-configuration.policy.js'
import { decideResend } from '../domain/contractor-reply-resend.policy.js'

const ACTIVE_CONTACT_STATUS = 'active'

export function readAlertIntervalMinutes(config: unknown): number {
  const value =
    typeof config === 'object' && config !== null && 'alertIntervalMinutes' in config
      ? config.alertIntervalMinutes
      : undefined
  const parsed = contractorReplyConfigurationSchema.shape.alertIntervalMinutes.safeParse(value)
  return parsed.success ? parsed.data : 0
}

/** The resend marker: an operator event that leaves the reply in the same waiting status. */
export async function findLastResendAt(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly replyId: string },
): Promise<Date | null> {
  const [row] = await queryable
    .select({ lastResendAt: max(occurrenceContractorReplyEvents.createdAt) })
    .from(occurrenceContractorReplyEvents)
    .where(
      and(
        eq(occurrenceContractorReplyEvents.companyId, input.companyId),
        eq(occurrenceContractorReplyEvents.replyId, input.replyId),
        eq(occurrenceContractorReplyEvents.actorKind, 'user'),
        sql`${occurrenceContractorReplyEvents.fromStatus} = ${occurrenceContractorReplyEvents.toStatus}`,
        inArray(occurrenceContractorReplyEvents.toStatus, [...CONTRACTOR_REPLY_WAITING_STATUSES]),
      ),
    )
  return row?.lastResendAt ?? null
}

export async function recordContractorReplyResend(
  queryable: TripQueryable,
  input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly now: Date
    readonly occurrenceId: string
  },
): Promise<RecordContractorReplyResendOutcome> {
  const [reply] = await queryable
    .select({
      config: occurrenceContractorReplies.config,
      id: occurrenceContractorReplies.id,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, input.companyId),
        eq(occurrenceContractorReplies.occurrenceId, input.occurrenceId),
      ),
    )
    .for('update')
    .limit(1)
  if (reply === undefined) return 'not_resendable'

  const decision = decideResend({
    alertIntervalMinutes: readAlertIntervalMinutes(reply.config),
    lastResendAt: await findLastResendAt(queryable, {
      companyId: input.companyId,
      replyId: reply.id,
    }),
    now: input.now,
    status: reply.status,
  })
  if (decision.kind === 'blocked') {
    return decision.reason === 'too_soon' ? 'too_soon' : 'not_resendable'
  }

  await queryable.insert(occurrenceContractorReplyEvents).values({
    actorKind: 'user',
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    createdAt: input.now,
    fromStatus: reply.status,
    replyId: reply.id,
    toStatus: reply.status,
  })
  return 'recorded'
}

/**
 * The original request: the first outbound mail of the contractor conversation of the reply. The raw
 * text the operator or the type wrote (without signature), the subject and the addresses it went to.
 */
async function findOriginalRequest(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly conversationId: string },
): Promise<ContractorReplyResendContext['original']> {
  const [row] = await queryable
    .select({
      bodyText: occurrenceConversationMessages.bodyText,
      subject: contractorMailMessages.subject,
      toAddresses: contractorMailMessages.toAddresses,
    })
    .from(occurrenceConversationMessages)
    .innerJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, occurrenceConversationMessages.companyId),
        eq(contractorMailMessages.id, occurrenceConversationMessages.mailMessageId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.conversationId, input.conversationId),
        eq(occurrenceConversationMessages.direction, 'outbound'),
        eq(contractorMailMessages.direction, 'outbound'),
      ),
    )
    .orderBy(asc(occurrenceConversationMessages.createdAt), asc(occurrenceConversationMessages.id))
    .limit(1)
  return row ?? null
}

/** The contacts that still receive occurrences and own an address the original request went to. */
async function findContactIds(
  queryable: TripQueryable,
  input: {
    readonly addresses: readonly string[]
    readonly companyId: string
    readonly contractorId: string
  },
): Promise<readonly string[]> {
  const wanted = new Set(input.addresses.map((address) => address.toLowerCase()))
  const rows = await queryable
    .select({ email: contractorContacts.email, id: contractorContacts.id })
    .from(contractorContacts)
    .where(
      and(
        eq(contractorContacts.companyId, input.companyId),
        eq(contractorContacts.contractorId, input.contractorId),
        eq(contractorContacts.status, ACTIVE_CONTACT_STATUS),
        eq(contractorContacts.receivesOccurrences, true),
      ),
    )
    .orderBy(asc(contractorContacts.createdAt), asc(contractorContacts.email))
  return rows.filter((row) => wanted.has(row.email.toLowerCase())).map((row) => row.id)
}

export function createDrizzleContractorReplyResendReader(
  database: TripQueryable,
): ContractorReplyResendReaderPort {
  return {
    async findContext(input) {
      const [reply] = await database
        .select({
          conversationId: occurrenceContractorReplies.conversationId,
          contractorId: occurrenceConversations.contractorId,
        })
        .from(occurrenceContractorReplies)
        .innerJoin(
          occurrenceConversations,
          and(
            eq(occurrenceConversations.companyId, occurrenceContractorReplies.companyId),
            eq(occurrenceConversations.id, occurrenceContractorReplies.conversationId),
          ),
        )
        .where(
          and(
            eq(occurrenceContractorReplies.companyId, input.companyId),
            eq(occurrenceContractorReplies.occurrenceId, input.occurrenceId),
          ),
        )
        .orderBy(desc(occurrenceContractorReplies.createdAt))
        .limit(1)
      if (reply === undefined) return null

      const original = await findOriginalRequest(database, {
        companyId: input.companyId,
        conversationId: reply.conversationId,
      })
      const contactIds =
        original === null || reply.contractorId === null
          ? []
          : await findContactIds(database, {
              addresses: original.toAddresses,
              companyId: input.companyId,
              contractorId: reply.contractorId,
            })
      return { contactIds, original }
    },
  }
}
