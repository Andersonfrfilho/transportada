/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import { tripFinancialParcels, tripFinancialResults } from '../../database/trip-financial.schema.js'
import type {
  TripFinancialParcel,
  TripFinancialResult,
  TripFinancialResultPort,
} from '../application/trip-financial-result.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type ResultRow = typeof tripFinancialResults.$inferSelect

export class DrizzleTripFinancialResultRepository implements TripFinancialResultPort {
  public constructor(private readonly database: Database) {}

  public async findCurrent(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripFinancialResult | null> {
    const [row] = await this.database
      .select()
      .from(tripFinancialResults)
      .where(
        and(
          eq(tripFinancialResults.companyId, input.companyId),
          eq(tripFinancialResults.tripId, input.tripId),
          eq(tripFinancialResults.isCurrent, true),
        ),
      )
      .limit(1)
    if (row === undefined) return null

    return { ...toResult(row), parcels: await this.readParcels(row) }
  }

  public async insertVersion(input: {
    readonly actorUserId: null | string
    readonly companyId: string
    readonly result: Omit<TripFinancialResult, 'frozenAt' | 'version'>
  }): Promise<TripFinancialResult> {
    return this.database.transaction(async (transaction) => {
      const [previous] = await transaction
        .select({ version: tripFinancialResults.version })
        .from(tripFinancialResults)
        .where(
          and(
            eq(tripFinancialResults.companyId, input.companyId),
            eq(tripFinancialResults.tripId, input.result.tripId),
          ),
        )
        .orderBy(desc(tripFinancialResults.version))
        .limit(1)

      /** A anterior sai de cena antes de a nova entrar: o índice parcial não aceita duas vivas. */
      await transaction
        .update(tripFinancialResults)
        .set({ isCurrent: false })
        .where(
          and(
            eq(tripFinancialResults.companyId, input.companyId),
            eq(tripFinancialResults.tripId, input.result.tripId),
            eq(tripFinancialResults.isCurrent, true),
          ),
        )

      const [created] = await transaction
        .insert(tripFinancialResults)
        .values({
          actorUserId: input.actorUserId,
          assumptions: input.result.assumptions,
          companyId: input.companyId,
          costTotal: input.result.costTotal,
          isComplete: input.result.isComplete,
          isCurrent: true,
          marginRate: input.result.marginRate,
          netAmount: input.result.netAmount,
          recalculationReason: input.result.recalculationReason,
          revenueAmount: input.result.revenueAmount,
          revenueDocumentCount: input.result.revenueDocumentCount,
          revenueExpectedCount: input.result.revenueExpectedCount,
          taxTotal: input.result.taxTotal,
          tripId: input.result.tripId,
          version: (previous?.version ?? 0n) + 1n,
        })
        .returning()
      const row = created as ResultRow

      if (input.result.parcels.length > 0) {
        await transaction.insert(tripFinancialParcels).values(
          input.result.parcels.map((parcel) => ({
            amount: parcel.amount,
            companyId: input.companyId,
            kind: parcel.kind,
            nature: parcel.nature,
            note: parcel.note,
            resultId: row.id,
            source: parcel.source,
          })),
        )
      }

      return { ...toResult(row), parcels: input.result.parcels }
    })
  }

  private async readParcels(row: ResultRow): Promise<readonly TripFinancialParcel[]> {
    const parcels = await this.database
      .select({
        amount: tripFinancialParcels.amount,
        kind: tripFinancialParcels.kind,
        nature: tripFinancialParcels.nature,
        note: tripFinancialParcels.note,
        source: tripFinancialParcels.source,
      })
      .from(tripFinancialParcels)
      .where(
        and(
          eq(tripFinancialParcels.companyId, row.companyId),
          eq(tripFinancialParcels.resultId, row.id),
        ),
      )

    return parcels
  }
}

function toResult(row: ResultRow): Omit<TripFinancialResult, 'parcels'> {
  return {
    assumptions: row.assumptions as Readonly<Record<string, unknown>>,
    costTotal: row.costTotal,
    frozenAt: row.frozenAt.toISOString(),
    isComplete: row.isComplete,
    marginRate: row.marginRate,
    netAmount: row.netAmount,
    recalculationReason: row.recalculationReason,
    revenueAmount: row.revenueAmount,
    revenueDocumentCount: row.revenueDocumentCount,
    revenueExpectedCount: row.revenueExpectedCount,
    taxTotal: row.taxTotal,
    tripId: row.tripId,
    version: Number(row.version),
  }
}
