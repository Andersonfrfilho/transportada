/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF13/RF6: leitura do retorno da contratante e a ação "Marcar como tratado". Toda consulta leva
 * `company_id`; o evento nunca carrega o usuário, só o tipo de ator.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceContractorReplyEvents,
  tripDocumentOccurrences,
} from '../../database/database.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  ContractorReplyHandledPort,
  ContractorReplyReaderPort,
  ContractorReplyView,
} from '../application/contractor-reply-view.port.js'
import { contractorReplyConfigurationSchema } from '../domain/contractor-reply-configuration.policy.js'
import { decideResend } from '../domain/contractor-reply-resend.policy.js'
import {
  findLastResendAt,
  readAlertIntervalMinutes,
} from './drizzle-contractor-reply-resend.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** The statuses that can still be closed by the operator; `delivered` and `cancelled` are final. */
const HANDLEABLE_STATUSES = [
  'awaiting_contractor',
  'overdue',
  'reply_received',
  'awaiting_operator',
  'needs_operator',
] as const

const EVENT_LIMIT = 100

async function occurrenceExists(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<boolean> {
  const [row] = await queryable
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .limit(1)
  return row !== undefined
}

function readAlertMaxCount(config: unknown): number {
  const value =
    typeof config === 'object' && config !== null && 'alertMaxCount' in config
      ? config.alertMaxCount
      : undefined
  const parsed = contractorReplyConfigurationSchema.shape.alertMaxCount.safeParse(value)
  return parsed.success ? parsed.data : 0
}

export function createDrizzleContractorReplyReader(
  database: Database,
  options: { readonly clock?: () => Date } = {},
): ContractorReplyReaderPort {
  const clock = options.clock ?? (() => new Date())
  return {
    async findByOccurrence(input) {
      if (!(await occurrenceExists(database, input))) return undefined
      const [reply] = await database
        .select({
          alertCount: occurrenceContractorReplies.alertCount,
          config: occurrenceContractorReplies.config,
          deadlineAt: occurrenceContractorReplies.deadlineAt,
          handledNote: occurrenceContractorReplies.handledNote,
          id: occurrenceContractorReplies.id,
          reason: occurrenceContractorReplies.reason,
          replyAttachmentId: occurrenceContractorReplies.replyAttachmentId,
          status: occurrenceContractorReplies.status,
        })
        .from(occurrenceContractorReplies)
        .where(
          and(
            eq(occurrenceContractorReplies.companyId, input.companyId),
            eq(occurrenceContractorReplies.occurrenceId, input.occurrenceId),
          ),
        )
        .limit(1)
      if (reply === undefined) return null

      const [events, deliveries] = await Promise.all([
        database
          .select({
            actorKind: occurrenceContractorReplyEvents.actorKind,
            createdAt: occurrenceContractorReplyEvents.createdAt,
            fromStatus: occurrenceContractorReplyEvents.fromStatus,
            id: occurrenceContractorReplyEvents.id,
            reason: occurrenceContractorReplyEvents.reason,
            toStatus: occurrenceContractorReplyEvents.toStatus,
          })
          .from(occurrenceContractorReplyEvents)
          .where(
            and(
              eq(occurrenceContractorReplyEvents.companyId, input.companyId),
              eq(occurrenceContractorReplyEvents.replyId, reply.id),
            ),
          )
          .orderBy(
            desc(occurrenceContractorReplyEvents.createdAt),
            desc(occurrenceContractorReplyEvents.id),
          )
          .limit(EVENT_LIMIT),
        database
          .select({
            id: occurrenceContractorReplyDeliveries.id,
            reason: occurrenceContractorReplyDeliveries.reason,
            sentAt: occurrenceContractorReplyDeliveries.sentAt,
            status: occurrenceContractorReplyDeliveries.status,
            target: occurrenceContractorReplyDeliveries.target,
          })
          .from(occurrenceContractorReplyDeliveries)
          .where(
            and(
              eq(occurrenceContractorReplyDeliveries.companyId, input.companyId),
              eq(occurrenceContractorReplyDeliveries.replyId, reply.id),
            ),
          )
          .orderBy(desc(occurrenceContractorReplyDeliveries.createdAt)),
      ])

      const decision = decideResend({
        alertIntervalMinutes: readAlertIntervalMinutes(reply.config),
        lastResendAt: await findLastResendAt(database, {
          companyId: input.companyId,
          replyId: reply.id,
        }),
        now: clock(),
        status: reply.status,
      })
      const view: ContractorReplyView = {
        alertCount: reply.alertCount,
        alertMaxCount: readAlertMaxCount(reply.config),
        deadlineAt: reply.deadlineAt,
        deliveries,
        events,
        handledNote: reply.handledNote,
        reason: reply.reason,
        replyAttachmentId: reply.replyAttachmentId,
        resend:
          decision.kind === 'allowed'
            ? { availableAt: null, canResend: true, reason: null }
            : { availableAt: decision.availableAt, canResend: false, reason: decision.reason },
        status: reply.status,
      }
      return view
    },
  }
}

export function createDrizzleContractorReplyHandledWriter(
  database: Database,
): ContractorReplyHandledPort {
  return {
    markHandled: (input) =>
      database.transaction(async (transaction) => {
        const [reply] = await transaction
          .select({
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
        if (reply === undefined) return undefined
        if (reply.status === 'handled') return 'already_handled'

        const updated = await transaction
          .update(occurrenceContractorReplies)
          .set({
            handledByUserId: input.actorUserId,
            handledNote: input.note,
            /** O check `occurrence_contractor_replies_reason_check` só admite motivo em `needs_operator`; sem isto o tratar falha com 500. */
            reason: null,
            status: 'handled',
            updatedAt: input.now,
          })
          .where(
            and(
              eq(occurrenceContractorReplies.companyId, input.companyId),
              eq(occurrenceContractorReplies.id, reply.id),
              inArray(occurrenceContractorReplies.status, HANDLEABLE_STATUSES),
            ),
          )
          .returning({ id: occurrenceContractorReplies.id })
        if (updated.length === 0) return 'not_applicable'

        await transaction.insert(occurrenceContractorReplyEvents).values({
          actorKind: 'user',
          actorUserId: input.actorUserId,
          companyId: input.companyId,
          fromStatus: reply.status,
          replyId: reply.id,
          toStatus: 'handled',
        })
        return 'handled'
      }),
  }
}
