/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 275: o que o aviso da ocorrência do motorista lê — quem despachou, os responsáveis (lista da 271 com a
 * contratante da nota) e os rótulos da nota e da parada.
 */
import { and, desc, eq } from 'drizzle-orm'

import { loadEffectiveWatcherCandidates } from '../../contractor-mail/infrastructure/occurrence-watcher-candidates.query.js'
import { tripDispatchSnapshots } from '../../database/trip.schema.js'
import type { DriverOccurrenceNotificationReader } from '../application/driver-occurrence-notifier.service.js'
import { readOccurrenceLabels } from './delivery-proof-read.support.js'
import { findDocumentOccurrenceSubject } from './document-occurrence-subject.query.js'
import type { TripDatabase } from './trip-queryable.type.js'

export function createDriverOccurrenceNotificationReader(
  database: TripDatabase,
): DriverOccurrenceNotificationReader {
  return {
    async findDispatcherUserId({ companyId, tripId }) {
      const [row] = await database
        .select({ actorUserId: tripDispatchSnapshots.actorUserId })
        .from(tripDispatchSnapshots)
        .where(
          and(
            eq(tripDispatchSnapshots.companyId, companyId),
            eq(tripDispatchSnapshots.tripId, tripId),
          ),
        )
        .orderBy(desc(tripDispatchSnapshots.dispatchedAt))
        .limit(1)
      return row?.actorUserId ?? null
    },
    async findWatcherCandidates({ companyId, documentId, occurrenceTypeId }) {
      const subject = await findDocumentOccurrenceSubject(database, { companyId, documentId })
      return loadEffectiveWatcherCandidates(database, {
        companyId,
        contractorId: subject?.contractorId ?? null,
        occurrenceTypeId,
      })
    },
    readLabels: (params) => readOccurrenceLabels(database, params),
  }
}
