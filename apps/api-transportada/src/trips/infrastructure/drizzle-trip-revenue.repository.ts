/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Espelha `drizzle-trip-cost.repository.ts` — mesma trilha de autor, mesmo tratamento de perfil
 * apagado (spec 143 aceite 6).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNull } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { companyEntryKinds, tripRevenueEntries } from '../../database/trip-financial.schema.js'
import { trips } from '../../database/trip.schema.js'
import type {
  TripRevenueEntryView,
  TripRevenueListPort,
} from '../application/list-trip-revenues.use-case.js'
import { resolveActorName } from './drizzle-trip-cost.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleTripRevenueRepository implements TripRevenueListPort {
  public constructor(private readonly database: Database) {}

  public async record(input: {
    readonly actorUserId: string
    readonly amount: string
    readonly companyId: string
    readonly description: string
    readonly entryKindId: string
    readonly tripId: string
  }): Promise<{ readonly id: string }> {
    const [created] = await this.database
      .insert(tripRevenueEntries)
      .values({
        actorUserId: input.actorUserId,
        amount: input.amount,
        companyId: input.companyId,
        description: input.description,
        entryKindId: input.entryKindId,
        tripId: input.tripId,
      })
      .returning({ id: tripRevenueEntries.id })

    if (created === undefined) throw new Error('trip_revenue_entries insert returned no row')

    return { id: created.id }
  }

  /** Spec 169 RF12/RF13: remove sem apagar — marca quem e quando, e a leitura passa a ignorar. */
  public async remove(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly entryId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [updated] = await this.database
      .update(tripRevenueEntries)
      .set({ removedAt: new Date(), removedByUserId: input.actorUserId })
      .where(
        and(
          eq(tripRevenueEntries.companyId, input.companyId),
          eq(tripRevenueEntries.tripId, input.tripId),
          eq(tripRevenueEntries.id, input.entryId),
          isNull(tripRevenueEntries.removedAt),
        ),
      )
      .returning({ id: tripRevenueEntries.id })

    return updated !== undefined
  }

  /** Spec 143 aceite 7 (espelhado): viagem fora da empresa devolve `null`, nunca a lista vazia de outro tenant. */
  public async listByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripRevenueEntryView[] | null> {
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
        actorUserId: tripRevenueEntries.actorUserId,
        amount: tripRevenueEntries.amount,
        createdAt: tripRevenueEntries.createdAt,
        description: tripRevenueEntries.description,
        entryKindId: tripRevenueEntries.entryKindId,
        entryKindName: companyEntryKinds.name,
        id: tripRevenueEntries.id,
      })
      .from(tripRevenueEntries)
      .leftJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, tripRevenueEntries.actorUserId),
      )
      .innerJoin(companyEntryKinds, eq(companyEntryKinds.id, tripRevenueEntries.entryKindId))
      .where(
        and(
          eq(tripRevenueEntries.companyId, input.companyId),
          eq(tripRevenueEntries.tripId, input.tripId),
          /** Spec 169 RF13: removida não aparece na lista por padrão. */
          isNull(tripRevenueEntries.removedAt),
        ),
      )
      .orderBy(desc(tripRevenueEntries.createdAt))

    return rows.map((row) => ({
      actor: { name: resolveActorName(row), userId: row.actorUserId },
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
      description: row.description,
      entryKind: { id: row.entryKindId, name: row.entryKindName },
      id: row.id,
    }))
  }
}
