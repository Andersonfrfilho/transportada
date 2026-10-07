/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: as consultas da ocorrência de recebimento — uma por tabela, nunca uma por linha, e a
 * empresa do contexto em TODA junção (a ocorrência de uma empresa nunca aparece na tela de outra).
 */
import { and, asc, eq, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripOccurrenceCases,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { ArrivalScope } from '../application/cargo-arrival-occurrence.port.js'
import type { ReceivingOccurrenceTypeView } from '../application/cargo-arrival-occurrence.types.js'
import {
  buildArrivalDocumentFilters,
  buildArrivalFilters,
  type Database,
} from './cargo-arrival-persistence.support.js'

const actorMembership = alias(userCompanyMemberships, 'cargo_occurrence_actor_membership')
const actorProfile = alias(identityUserProfiles, 'cargo_occurrence_actor_profile')

export async function arrivalExists(database: Database, scope: ArrivalScope): Promise<boolean> {
  const [row] = await database
    .select({ id: cargoArrivals.id })
    .from(cargoArrivals)
    .where(and(...buildArrivalFilters(scope)))
  return row !== undefined
}

export function selectArrivalReturns(database: Database, scope: ArrivalScope) {
  return database
    .select({
      nfeDocumentId: cargoArrivalDocuments.nfeDocumentId,
      returnOccurrenceId: cargoArrivalDocuments.returnOccurrenceId,
      returnToContractor: cargoArrivalDocuments.returnToContractor,
    })
    .from(cargoArrivalDocuments)
    .where(and(...buildArrivalDocumentFilters(scope)))
    .orderBy(asc(cargoArrivalDocuments.nfeDocumentId))
}

export type ArrivalOccurrenceFilter = ArrivalScope & {
  readonly nfeDocumentId: string | null
  readonly occurrenceId: string | null
}

function occurrenceConditions(filter: ArrivalOccurrenceFilter): SQL[] {
  const conditions: SQL[] = [
    eq(tripDocumentOccurrences.companyId, filter.companyId),
    eq(tripDocumentOccurrences.stage, TRIP_OCCURRENCE_STAGE.receiving),
    ...buildArrivalDocumentFilters(filter),
  ]
  if (filter.nfeDocumentId !== null) {
    conditions.push(eq(cargoArrivalDocuments.nfeDocumentId, filter.nfeDocumentId))
  }
  if (filter.occurrenceId !== null) {
    conditions.push(eq(tripDocumentOccurrences.id, filter.occurrenceId))
  }
  return conditions
}

const OCCURRENCE_COLUMNS = {
  actorName: actorProfile.name,
  cancelledAt: tripDocumentOccurrences.cancelledAt,
  caseId: tripOccurrenceCases.id,
  caseStatus: tripOccurrenceCases.status,
  channel: tripDocumentOccurrences.channel,
  createdAt: tripDocumentOccurrences.createdAt,
  id: tripDocumentOccurrences.id,
  nfeDocumentId: cargoArrivalDocuments.nfeDocumentId,
  note: tripDocumentOccurrences.note,
  occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
  productCode: tripDocumentOccurrences.productCode,
  typeName: companyOccurrenceTypes.name,
}

export function selectArrivalOccurrences(database: Database, filter: ArrivalOccurrenceFilter) {
  return database
    .select(OCCURRENCE_COLUMNS)
    .from(tripDocumentOccurrences)
    .innerJoin(
      cargoArrivalDocuments,
      and(
        eq(cargoArrivalDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(cargoArrivalDocuments.id, tripDocumentOccurrences.cargoArrivalDocumentId),
      ),
    )
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .leftJoin(
      tripOccurrenceCases,
      and(
        eq(tripOccurrenceCases.companyId, tripDocumentOccurrences.companyId),
        eq(tripOccurrenceCases.occurrenceId, tripDocumentOccurrences.id),
      ),
    )
    .leftJoin(
      actorMembership,
      and(
        eq(actorMembership.companyId, tripDocumentOccurrences.companyId),
        eq(actorMembership.userId, tripDocumentOccurrences.actorUserId),
        eq(actorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(actorProfile, eq(actorProfile.userId, actorMembership.userId))
    .where(and(...occurrenceConditions(filter)))
    .orderBy(asc(tripDocumentOccurrences.createdAt), asc(tripDocumentOccurrences.id))
}

export async function selectReceivingOccurrenceTypes(
  database: Database,
  companyId: string,
): Promise<readonly ReceivingOccurrenceTypeView[]> {
  return database
    .select({
      allowsMultipleItems: companyOccurrenceTypes.allowsMultipleItems,
      id: companyOccurrenceTypes.id,
      itemsMode: companyOccurrenceTypes.itemsMode,
      name: companyOccurrenceTypes.name,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.stage, TRIP_OCCURRENCE_STAGE.receiving),
        eq(companyOccurrenceTypes.active, true),
      ),
    )
    .orderBy(asc(companyOccurrenceTypes.name), asc(companyOccurrenceTypes.id))
}
