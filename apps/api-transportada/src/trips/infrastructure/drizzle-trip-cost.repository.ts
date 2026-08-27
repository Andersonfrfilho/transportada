/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { tripCostEntries, type TripCostEntryKind } from '../../database/trip-financial.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Spec 061 D2: o pedágio e o gasto avulso, que só existem porque alguém lançou. */
export class DrizzleTripCostRepository {
  public constructor(private readonly database: Database) {}

  public async record(input: {
    readonly actorUserId: string
    readonly amount: string
    readonly companyId: string
    readonly description: string
    readonly kind: TripCostEntryKind
    readonly tripId: string
  }): Promise<{ readonly id: string }> {
    const [created] = await this.database
      .insert(tripCostEntries)
      .values({
        actorUserId: input.actorUserId,
        amount: input.amount,
        companyId: input.companyId,
        description: input.description,
        kind: input.kind,
        tripId: input.tripId,
      })
      .returning({ id: tripCostEntries.id })

    return { id: created?.id ?? '' }
  }
}
