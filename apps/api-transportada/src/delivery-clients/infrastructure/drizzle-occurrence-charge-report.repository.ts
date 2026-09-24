/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T19. A consulta serve `delivery_charges_contractor_period_idx`
 * (`company_id, contractor_id, charged_on`, criada na T16) — `contractorId`/`chargedOn` entram
 * sempre no `where`, então o índice cobre o recorte mais comum mesmo quando o operador não filtra
 * por contratante (a igualdade por `companyId` já restringe o exame ao prefixo do índice).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, exists, gt, gte, ilike, isNull, lte, or, type SQL, sql } from 'drizzle-orm'

import { deliveryCharges } from '../../database/delivery-client.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  tripDocuments,
  tripOccurrenceCases,
  tripOccurrenceItemSettlements,
} from '../../database/trip.schema.js'
import type {
  OccurrenceChargeReportFilters,
  OccurrenceChargeReportPage,
  OccurrenceChargeReportPort,
  OccurrenceChargeReportRow,
} from '../application/occurrence-charge-report.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleOccurrenceChargeReportRepository implements OccurrenceChargeReportPort {
  public constructor(private readonly database: Database) {}

  public async read(input: {
    readonly companyId: string
    readonly filters: OccurrenceChargeReportFilters
  }): Promise<OccurrenceChargeReportPage> {
    const { filters } = input

    const settlementExists = exists(
      this.database
        .select({ id: tripOccurrenceCases.id })
        .from(tripOccurrenceCases)
        .innerJoin(
          tripOccurrenceItemSettlements,
          and(
            eq(tripOccurrenceItemSettlements.companyId, tripOccurrenceCases.companyId),
            eq(tripOccurrenceItemSettlements.caseId, tripOccurrenceCases.id),
          ),
        )
        .where(
          and(
            eq(tripOccurrenceCases.companyId, deliveryCharges.companyId),
            eq(tripOccurrenceCases.occurrenceId, deliveryCharges.occurrenceId),
          ),
        ),
    )

    /** Condições do recorte inteiro (sem o cursor) — usadas tanto na página quanto nos totais. */
    const scope = and(
      eq(deliveryCharges.companyId, input.companyId),
      sql`${deliveryCharges.occurrenceId} is not null`,
      isNull(deliveryCharges.batchId),
      ...(filters.contractorId === undefined
        ? []
        : [eq(deliveryCharges.contractorId, filters.contractorId)]),
      ...(filters.from === undefined ? [] : [gte(deliveryCharges.chargedOn, filters.from)]),
      ...(filters.to === undefined ? [] : [lte(deliveryCharges.chargedOn, filters.to)]),
      ...(filters.chargeType === undefined
        ? []
        : [eq(deliveryCharges.chargeType, filters.chargeType)]),
      ...(filters.status === undefined ? [] : [eq(deliveryCharges.status, filters.status)]),
      ...(filters.hasSettlement === undefined
        ? []
        : [filters.hasSettlement ? settlementExists : sql`not ${settlementExists}`]),
      ...(filters.search === undefined || filters.search.length === 0
        ? []
        : [
            or(
              ilike(nfeDocuments.accessKey, `%${filters.search}%`),
              ilike(nfeDocuments.number, `%${filters.search}%`),
            ) as SQL,
          ]),
    ) as SQL

    const pageWhere =
      filters.cursor === undefined ? scope : and(scope, gt(deliveryCharges.id, filters.cursor))

    const rows = await this.database
      .select({
        accessKey: nfeDocuments.accessKey,
        amount: deliveryCharges.amount,
        chargeType: deliveryCharges.chargeType,
        chargedOn: deliveryCharges.chargedOn,
        contractorId: deliveryCharges.contractorId,
        hasSettlement: sql<boolean>`${settlementExists}`,
        id: deliveryCharges.id,
        noteNumber: nfeDocuments.number,
        noteSeries: nfeDocuments.series,
        occurrenceId: deliveryCharges.occurrenceId,
        status: deliveryCharges.status,
        tripDocumentId: deliveryCharges.tripDocumentId,
      })
      .from(deliveryCharges)
      .leftJoin(tripDocuments, eq(tripDocuments.id, deliveryCharges.tripDocumentId))
      .leftJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
      .where(pageWhere)
      .orderBy(asc(deliveryCharges.id))
      .limit(filters.limit + 1)

    const page = rows.slice(0, filters.limit)

    const totalsRows = await this.database
      .select({
        amount: sql<string>`coalesce(sum(${deliveryCharges.amount}), 0)::text`,
        chargeType: deliveryCharges.chargeType,
        count: sql<string>`count(*)::text`,
      })
      .from(deliveryCharges)
      .leftJoin(tripDocuments, eq(tripDocuments.id, deliveryCharges.tripDocumentId))
      .leftJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
      .where(scope)
      .groupBy(deliveryCharges.chargeType)

    const totals = {
      byChargeType: totalsRows.map((row) => ({
        amount: row.amount,
        chargeType: row.chargeType,
        count: Number(row.count),
      })),
      totalAmount: totalsRows
        .reduce((accumulated, row) => accumulated + Number(row.amount), 0)
        .toFixed(4),
      totalCount: totalsRows.reduce((accumulated, row) => accumulated + Number(row.count), 0),
    }

    return {
      items: page.map(toRow),
      nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
      totals,
    }
  }
}

function toRow(row: {
  readonly accessKey: string | null
  readonly amount: string
  readonly chargeType: OccurrenceChargeReportRow['chargeType']
  readonly chargedOn: string
  readonly contractorId: string | null
  readonly hasSettlement: boolean
  readonly id: string
  readonly noteNumber: string | null
  readonly noteSeries: string | null
  readonly occurrenceId: string | null
  readonly status: OccurrenceChargeReportRow['status']
  readonly tripDocumentId: string | null
}): OccurrenceChargeReportRow {
  return row
}
