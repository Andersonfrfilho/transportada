/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 RF9 / ADR-0105: os avisos `trip.occurrence-resolved` (tripulação, só com a viagem em andamento) e
 * `trip.occurrence-reopened` (quem resolveu, se ainda pode). Os payloads levam ids e o nome do tipo — nunca a
 * observação do operador nem o texto da mensagem do motorista. Falha é registrada pelo nome do erro e não sobe.
 */
import { and, desc, eq } from 'drizzle-orm'

import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import {
  fleetDrivers,
  tripDrivers,
  trips,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { tripOccurrenceResolutionEvents } from '../../database/occurrence-conversation.schema.js'
import { tripOccurrenceCaseEvents } from '../../database/trip.schema.js'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/domain/notification-catalog.constant.js'
import type { OccurrenceResolutionNotifierPort } from '../application/occurrence-resolution-notifier.port.js'
import { CURRENT_DRIVER_TRIP_STATUSES } from '../domain/trip-state.policy.js'
import { findTripOccurrenceFeedItem } from './trip-occurrence-feed.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Logger = {
  info(event: string, meta?: Record<string, unknown>): void
  warn(event: string, meta?: Record<string, unknown>): void
}

type SendNotification = (input: {
  readonly category: string
  readonly companyId: string
  readonly dedupeKey: string
  readonly payload: object
  readonly recipientUserId: string
  readonly templateKey: string
}) => Promise<unknown>

export const OCCURRENCE_RESOLUTION_NOTIFIER_LOG = {
  failed: 'occurrence_resolution_notice_failed',
  reopenedSkipped: 'occurrence.resolution.reopened_notice_skipped',
} as const

async function listCrewUserIds(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ userId: userCompanyMemberships.userId })
    .from(tripDrivers)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .innerJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
        eq(userCompanyMemberships.id, fleetDrivers.membershipId),
        eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))
  return [...new Set(rows.map((row) => row.userId))]
}

async function isTripInProgress(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<boolean> {
  const [trip] = await queryable
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  return (
    trip !== undefined && (CURRENT_DRIVER_TRIP_STATUSES as readonly string[]).includes(trip.status)
  )
}

/** Interno: quem resolveu. Sistema: quem moveu a tratativa que causou a resolução. */
async function findLastResolverUserId(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: 'document' | 'stop'
  },
): Promise<string | undefined> {
  const ownerColumn =
    input.occurrenceKind === 'document'
      ? tripOccurrenceResolutionEvents.documentOccurrenceId
      : tripOccurrenceResolutionEvents.stopOccurrenceId
  const [row] = await queryable
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      actorUserId: tripOccurrenceResolutionEvents.actorUserId,
      caseActorUserId: tripOccurrenceCaseEvents.actorUserId,
    })
    .from(tripOccurrenceResolutionEvents)
    .leftJoin(
      tripOccurrenceCaseEvents,
      and(
        eq(tripOccurrenceCaseEvents.companyId, tripOccurrenceResolutionEvents.companyId),
        eq(tripOccurrenceCaseEvents.id, tripOccurrenceResolutionEvents.caseEventId),
      ),
    )
    .where(
      and(
        eq(tripOccurrenceResolutionEvents.companyId, input.companyId),
        eq(ownerColumn, input.occurrenceId),
        eq(tripOccurrenceResolutionEvents.kind, 'resolved'),
      ),
    )
    .orderBy(
      desc(tripOccurrenceResolutionEvents.createdAt),
      desc(tripOccurrenceResolutionEvents.id),
    )
    .limit(1)
  if (row === undefined) return undefined
  return (row.actorKind === 'internal' ? row.actorUserId : row.caseActorUserId) ?? undefined
}

export function createOccurrenceResolutionNotifier(input: {
  readonly canUserResolveOccurrences: (params: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<boolean>
  readonly logger: Logger
  readonly queryable: TripQueryable
  readonly send: SendNotification
}): OccurrenceResolutionNotifierPort {
  const { queryable } = input

  async function guarded(companyId: string, work: () => Promise<void>): Promise<void> {
    try {
      await work()
    } catch (error) {
      input.logger.warn(OCCURRENCE_RESOLUTION_NOTIFIER_LOG.failed, {
        companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
    }
  }

  return {
    notifyResolved: ({ companyId, dedupeKey, occurrenceId }) =>
      guarded(companyId, async () => {
        const item = await findTripOccurrenceFeedItem(queryable, { companyId, occurrenceId })
        if (item === null) return
        if (!(await isTripInProgress(queryable, { companyId, tripId: item.tripId }))) return
        const templateKey = NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_RESOLVED
        const recipients = await listCrewUserIds(queryable, { companyId, tripId: item.tripId })
        await Promise.all(
          recipients.map((recipientUserId) =>
            input.send({
              category: NOTIFICATION_CATEGORY.TRIP,
              companyId,
              dedupeKey: `${templateKey}:${dedupeKey}:${recipientUserId}`,
              payload: {
                occurrenceKind: item.source,
                subjectId: occurrenceId,
                subjectType: 'occurrence',
                typeName: item.typeName,
              },
              recipientUserId,
              templateKey,
            }),
          ),
        )
      }),

    notifyReopened: ({ companyId, messageId, occurrenceId }) =>
      guarded(companyId, async () => {
        const item = await findTripOccurrenceFeedItem(queryable, { companyId, occurrenceId })
        if (item === null) return
        const recipientUserId = await findLastResolverUserId(queryable, {
          companyId,
          occurrenceId,
          occurrenceKind: item.source,
        })
        const canResolve =
          recipientUserId !== undefined &&
          (await input.canUserResolveOccurrences({ companyId, userId: recipientUserId }))
        if (recipientUserId === undefined || !canResolve) {
          input.logger.info(OCCURRENCE_RESOLUTION_NOTIFIER_LOG.reopenedSkipped, {
            companyId,
            occurrenceId,
            reason: recipientUserId === undefined ? 'no_resolver' : 'resolver_cannot_resolve',
          })
          return
        }
        const templateKey = NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_REOPENED
        await input.send({
          category: NOTIFICATION_CATEGORY.TRIP,
          companyId,
          dedupeKey: `${templateKey}:${messageId}`,
          payload: {
            occurrenceId,
            occurrenceKind: item.source,
            tripId: item.tripId,
            typeName: item.typeName,
          },
          recipientUserId,
          templateKey,
        })
      }),
  }
}
