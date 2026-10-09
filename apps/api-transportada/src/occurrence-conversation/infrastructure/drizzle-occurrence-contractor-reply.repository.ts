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
  tripDocumentOccurrences,
} from '../../database/database.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { StoredContractorReplyConfiguration } from '../application/occurrence-mail.port.js'
import type { ContractorReplyConfiguration } from '../domain/contractor-reply-configuration.policy.js'

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
