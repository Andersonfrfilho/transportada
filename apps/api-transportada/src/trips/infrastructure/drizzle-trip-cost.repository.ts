/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { tripCostEntries, type TripCostEntryKind } from '../../database/trip-financial.schema.js'
import { trips } from '../../database/trip.schema.js'
import type {
  TripCostEntryView,
  TripCostListPort,
} from '../application/list-trip-costs.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const REMOVED_USER_NAME = 'usuário removido'

/** Spec 143 aceite 6: perfil apagado ainda deixa o lançamento — o autor cai para e-mail e depois este texto. */
export function resolveActorName(row: {
  readonly actorEmail: string | null
  readonly actorName: string | null
}): string {
  if (row.actorName !== null && row.actorName.trim().length > 0) return row.actorName
  if (row.actorEmail !== null && row.actorEmail.trim().length > 0) return row.actorEmail

  return REMOVED_USER_NAME
}

/** Spec 061 D2: o pedágio e o gasto avulso, que só existem porque alguém lançou. */
export class DrizzleTripCostRepository implements TripCostListPort {
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

    if (created === undefined) throw new Error('trip_cost_entries insert returned no row')

    return { id: created.id }
  }

  /** Spec 143 aceite 7: viagem fora da empresa devolve `null` — nunca a lista vazia de outro tenant. */
  public async listByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripCostEntryView[] | null> {
    const [trip] = await this.database
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (trip === undefined) return null

    const rows = await this.database
      .select({
        actorEmail: identityUserProfiles.email,
        actorName: identityUserProfiles.name,
        actorUserId: tripCostEntries.actorUserId,
        amount: tripCostEntries.amount,
        createdAt: tripCostEntries.createdAt,
        description: tripCostEntries.description,
        id: tripCostEntries.id,
        kind: tripCostEntries.kind,
      })
      .from(tripCostEntries)
      .leftJoin(identityUserProfiles, eq(identityUserProfiles.userId, tripCostEntries.actorUserId))
      .where(
        and(
          eq(tripCostEntries.companyId, input.companyId),
          eq(tripCostEntries.tripId, input.tripId),
        ),
      )
      .orderBy(desc(tripCostEntries.createdAt))

    return rows.map((row) => ({
      actor: { name: resolveActorName(row), userId: row.actorUserId },
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
      description: row.description,
      id: row.id,
      kind: row.kind,
    }))
  }
}
