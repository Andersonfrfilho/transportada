/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, gte, lte, lt, or, sql, type SQL } from 'drizzle-orm'

import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { tripDocuments, tripDrivers, trips } from '../../database/trip.schema.js'
import type { KeysetCursor } from '../../shared/keyset-cursor.support.js'
import type { TripFilters } from '../application/trip.port.js'

/** `cte_fiscal_documents.status` — só este valor autoriza a emissão de MDF-e (ADR-0023 §3). */
const AUTHORIZED_CTE_DOCUMENT_STATUS = 'authorized'

type CompanyScope = { readonly companyId: string }

type TripListScope = CompanyScope & {
  readonly cursor: KeysetCursor | null
  readonly filters?: TripFilters
}

export function buildTripListFilters({
  companyId,
  cursor,
  filters,
}: TripListScope): readonly SQL[] {
  const conditions: SQL[] = [eq(trips.companyId, companyId)]
  if (cursor !== null) conditions.push(buildCursorCondition(cursor))
  if (filters?.statusEq !== undefined) conditions.push(eq(trips.status, filters.statusEq))
  if (filters?.vehicleIdEq !== undefined) conditions.push(eq(trips.vehicleId, filters.vehicleIdEq))
  if (filters?.driverIdEq !== undefined)
    conditions.push(tripDriverExistsCondition(filters.driverIdEq))
  if (filters?.createdFrom !== undefined) {
    conditions.push(gte(trips.createdAt, new Date(filters.createdFrom)))
  }
  if (filters?.createdUntil !== undefined) {
    conditions.push(lte(trips.createdAt, new Date(filters.createdUntil)))
  }
  return conditions
}

export function buildTripDocumentListFilters({
  companyId,
  tripId,
}: CompanyScope & { readonly tripId: string }): readonly SQL[] {
  return [eq(tripDocuments.companyId, companyId), eq(tripDocuments.tripId, tripId)]
}

/**
 * `trip_drivers` não tem índice em `(company_id, driver_id)` — só em `(company_id, trip_id, ...)`.
 * Aceitável dado o volume esperado de viagens (evidence.md, T009b); não há combinador
 * `exists()`/`inArray(column, subquery)` precedente no repositório, então segue o mesmo desenho de
 * `billingItemExistsExpression()` em `drizzle-cte-batch-item.repository.ts`.
 */
function tripDriverExistsCondition(driverId: string): SQL {
  return sql`exists (select 1 from ${tripDrivers} where ${and(
    eq(tripDrivers.companyId, trips.companyId),
    eq(tripDrivers.tripId, trips.id),
    eq(tripDrivers.driverId, driverId),
  )})`
}

/**
 * `TripDocumentDetail.fiscalStatus` reflete o status da própria NF-e/frete — não indica se já existe
 * CT-e autorizado (essa informação vive em `cte_batch_items`/`cte_fiscal_documents`, T009b deixou essa
 * lacuna). O gate "todas as notas têm CT-e autorizado" continua no frontend (ADR-0023 §3); aqui só
 * expomos o dado de leitura, no mesmo desenho de `tripDriverExistsCondition()`/`billingItemExistsExpression()`
 * em `drizzle-cte-batch-item.repository.ts`. `trip_documents.nfe_document_id` cobre o vínculo direto;
 * `freight_calculations.nfe_document_id` (sempre preenchido) cobre o vínculo por cálculo de frete.
 */
export function cteAuthorizedExpression(): SQL {
  return sql`exists (select 1 from ${cteBatchItems} inner join ${cteFiscalDocuments} on ${and(
    eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
    eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
  )} where ${and(
    eq(cteBatchItems.companyId, tripDocuments.companyId),
    or(
      eq(cteBatchItems.nfeDocumentId, tripDocuments.nfeDocumentId),
      eq(cteBatchItems.nfeDocumentId, freightCalculations.nfeDocumentId),
    ),
    eq(cteFiscalDocuments.status, AUTHORIZED_CTE_DOCUMENT_STATUS),
  )})`
}

function buildCursorCondition(cursor: KeysetCursor): SQL {
  return or(
    lt(trips.createdAt, cursor.createdAt),
    and(eq(trips.createdAt, cursor.createdAt), lt(trips.id, cursor.id)),
  ) as SQL
}
