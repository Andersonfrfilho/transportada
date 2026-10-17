/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D15, RF12): trocar o modelo, a cópia ou os destinatários do e-mail à contratante de um tipo
 * grava `audit_logs` na mesma transação, com ator, tipo e os ids de antes e depois — **nunca** endereço. Só quando
 * algo mudou.
 */
import { and, eq } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import { readOccurrenceTypeRecipientContactIds } from './occurrence-type-mail-recipients.support.js'
import { readOccurrenceTypeWatcherUserIds } from './occurrence-type-mail-watchers.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

export const OCCURRENCE_TYPE_MAIL_AUDIT_ACTION = 'occurrence_type.contractor_mail.updated'

export type OccurrenceTypeMailSnapshot = {
  readonly recipientContactIds: readonly string[]
  readonly templateKey: null | string
  readonly watcherUserIds: readonly string[]
}

const EMPTY_SNAPSHOT: OccurrenceTypeMailSnapshot = {
  recipientContactIds: [],
  templateKey: null,
  watcherUserIds: [],
}

export async function readOccurrenceTypeMailSnapshot(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<OccurrenceTypeMailSnapshot> {
  const [type] = await queryable
    .select({ templateKey: companyOccurrenceTypes.contractorNotificationTemplateKey })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, params.companyId),
        eq(companyOccurrenceTypes.id, params.occurrenceTypeId),
      ),
    )
    .limit(1)
  return {
    recipientContactIds: await readOccurrenceTypeRecipientContactIds(queryable, params),
    templateKey: type?.templateKey ?? null,
    watcherUserIds: await readOccurrenceTypeWatcherUserIds(queryable, params),
  }
}

/** `before` nulo é a criação do tipo: o antes é "nada escolhido". Listas já vêm ordenadas das leituras. */
export function hasOccurrenceTypeMailChange(
  before: null | OccurrenceTypeMailSnapshot,
  after: OccurrenceTypeMailSnapshot,
): boolean {
  const previous = before ?? EMPTY_SNAPSHOT
  return (
    previous.templateKey !== after.templateKey ||
    previous.watcherUserIds.join(',') !== after.watcherUserIds.join(',') ||
    previous.recipientContactIds.join(',') !== after.recipientContactIds.join(',')
  )
}

export async function writeOccurrenceTypeMailAudit(
  transaction: TripQueryable,
  params: {
    readonly actorUserId: string
    readonly after: OccurrenceTypeMailSnapshot
    readonly before: null | OccurrenceTypeMailSnapshot
    readonly companyId: string
    readonly correlationId: string
    readonly occurrenceTypeId: string
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: OCCURRENCE_TYPE_MAIL_AUDIT_ACTION,
    actorUserId: params.actorUserId,
    afterSnapshot: params.after,
    beforeSnapshot: params.before ?? EMPTY_SNAPSHOT,
    companyId: params.companyId,
    correlationId: params.correlationId,
    entityId: params.occurrenceTypeId,
    entityType: 'occurrence_type',
    permission: 'settings.manage',
    targetId: params.occurrenceTypeId,
    targetType: 'occurrence_type',
  })
}
