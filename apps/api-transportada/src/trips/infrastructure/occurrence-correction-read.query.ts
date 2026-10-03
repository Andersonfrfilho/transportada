/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235 RF9: a leitura em lote do que a spec 167 grava — as correções e o cancelamento de cada
 * ocorrência de nota. Uma consulta para todos os ids da página, agrupada em `Map`, nunca uma por
 * linha. É o único lugar que resolve o nome de quem corrigiu/cancelou (vínculo ativo na empresa):
 * a resposta das escritas e as três leituras publicam o mesmo formato porque leem por aqui.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import {
  tripDocumentOccurrenceCorrections,
  tripDocumentOccurrences,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type {
  OccurrenceCancellationView,
  OccurrenceCorrectionEntry,
} from '../application/occurrence-correction.port.js'
import type { OccurrenceItemQuantity } from '../domain/occurrence-item-quantity.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

const correctedByProfile = alias(
  identityUserProfiles,
  'trip_occurrence_correction_corrected_by_profile',
)
const correctedByMembership = alias(
  userCompanyMemberships,
  'trip_occurrence_correction_corrected_by_membership',
)
const cancelledByProfile = alias(
  identityUserProfiles,
  'trip_document_occurrence_cancelled_by_profile',
)
const cancelledByMembership = alias(
  userCompanyMemberships,
  'trip_document_occurrence_cancelled_by_membership',
)

type OccurrenceBatchInput = {
  readonly companyId: string
  readonly occurrenceIds: readonly string[]
}

/** Mais antiga primeiro; ocorrência sem correção não tem entrada no mapa. */
export async function listOccurrenceCorrectionsByIds(
  queryable: TripQueryable,
  input: OccurrenceBatchInput,
): Promise<Map<string, OccurrenceCorrectionEntry[]>> {
  const correctionsByOccurrence = new Map<string, OccurrenceCorrectionEntry[]>()
  if (input.occurrenceIds.length === 0) return correctionsByOccurrence

  const rows = await queryable
    .select({
      correctedAt: tripDocumentOccurrenceCorrections.createdAt,
      correctedByName: correctedByProfile.name,
      occurrenceId: tripDocumentOccurrenceCorrections.occurrenceId,
      previousItems: tripDocumentOccurrenceCorrections.previousItems,
    })
    .from(tripDocumentOccurrenceCorrections)
    .leftJoin(
      correctedByMembership,
      and(
        eq(correctedByMembership.companyId, tripDocumentOccurrenceCorrections.companyId),
        eq(correctedByMembership.userId, tripDocumentOccurrenceCorrections.correctedByUserId),
        eq(correctedByMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(correctedByProfile, eq(correctedByProfile.userId, correctedByMembership.userId))
    .where(
      and(
        eq(tripDocumentOccurrenceCorrections.companyId, input.companyId),
        inArray(tripDocumentOccurrenceCorrections.occurrenceId, [...input.occurrenceIds]),
      ),
    )
    .orderBy(
      asc(tripDocumentOccurrenceCorrections.createdAt),
      asc(tripDocumentOccurrenceCorrections.id),
    )

  for (const row of rows) {
    const entries = correctionsByOccurrence.get(row.occurrenceId) ?? []
    entries.push({
      correctedAt: row.correctedAt.toISOString(),
      correctedByName: row.correctedByName,
      previousItems: row.previousItems as readonly OccurrenceItemQuantity[],
    })
    correctionsByOccurrence.set(row.occurrenceId, entries)
  }
  return correctionsByOccurrence
}

/** Só as ocorrências canceladas têm entrada no mapa — a não cancelada lê `null`. */
export async function listOccurrenceCancellationsByIds(
  queryable: TripQueryable,
  input: OccurrenceBatchInput,
): Promise<Map<string, OccurrenceCancellationView>> {
  const cancellations = new Map<string, OccurrenceCancellationView>()
  if (input.occurrenceIds.length === 0) return cancellations

  const rows = await queryable
    .select({
      cancellationReason: tripDocumentOccurrences.cancellationReason,
      cancelledAt: tripDocumentOccurrences.cancelledAt,
      cancelledByName: cancelledByProfile.name,
      id: tripDocumentOccurrences.id,
    })
    .from(tripDocumentOccurrences)
    .leftJoin(
      cancelledByMembership,
      and(
        eq(cancelledByMembership.companyId, tripDocumentOccurrences.companyId),
        eq(cancelledByMembership.userId, tripDocumentOccurrences.cancelledByUserId),
        eq(cancelledByMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(cancelledByProfile, eq(cancelledByProfile.userId, cancelledByMembership.userId))
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        inArray(tripDocumentOccurrences.id, [...input.occurrenceIds]),
      ),
    )

  for (const row of rows) {
    if (row.cancelledAt === null) continue
    cancellations.set(row.id, {
      cancelledAt: row.cancelledAt.toISOString(),
      cancelledByName: row.cancelledByName,
      reason: row.cancellationReason ?? '',
    })
  }
  return cancellations
}
