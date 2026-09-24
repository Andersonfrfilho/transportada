/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNull } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import {
  companyEntryKinds,
  tripCostEntries,
  type TripCostEntryKind,
} from '../../database/trip-financial.schema.js'
import { trips } from '../../database/trip.schema.js'
import type {
  TripCostEntryView,
  TripCostListPort,
} from '../application/list-trip-costs.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const REMOVED_USER_NAME = 'usuário removido'

/** Spec 169 RF5: nome cadastrado → `kind` legado, que a agregação de pedágio × avulso ainda lê. */
function deriveCostKind(entryKindName: string): TripCostEntryKind {
  return entryKindName === 'Pedágio' ? 'toll' : 'other'
}

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
    readonly entryKindId?: string | undefined
    readonly kind?: TripCostEntryKind | undefined
    readonly tripId: string
  }): Promise<{ readonly id: string }> {
    const { entryKindId, kind } = await this.resolveKind(input)

    const [created] = await this.database
      .insert(tripCostEntries)
      .values({
        actorUserId: input.actorUserId,
        amount: input.amount,
        companyId: input.companyId,
        description: input.description,
        entryKindId,
        kind,
        tripId: input.tripId,
      })
      .returning({ id: tripCostEntries.id })

    if (created === undefined) throw new Error('trip_cost_entries insert returned no row')

    return { id: created.id }
  }

  /** Spec 169 RF5: `entryKindId` manda — `kind` é derivado do nome cadastrado, nunca os dois soltos. */
  private async resolveKind(input: {
    readonly companyId: string
    readonly entryKindId?: string | undefined
    readonly kind?: TripCostEntryKind | undefined
  }): Promise<{ entryKindId: null | string; kind: TripCostEntryKind }> {
    if (input.entryKindId === undefined) {
      if (input.kind === undefined) throw new Error('missing kind or entryKindId')
      return { entryKindId: null, kind: input.kind }
    }

    const [entryKind] = await this.database
      .select({ name: companyEntryKinds.name })
      .from(companyEntryKinds)
      .where(
        and(
          eq(companyEntryKinds.companyId, input.companyId),
          eq(companyEntryKinds.id, input.entryKindId),
        ),
      )
      .limit(1)
    if (entryKind === undefined) throw new Error('company_entry_kinds not found')

    return { entryKindId: input.entryKindId, kind: deriveCostKind(entryKind.name) }
  }

  /** Spec 169 RF12/RF13: remove sem apagar — marca quem e quando, e a leitura passa a ignorar. */
  public async remove(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly entryId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [updated] = await this.database
      .update(tripCostEntries)
      .set({ removedAt: new Date(), removedByUserId: input.actorUserId })
      .where(
        and(
          eq(tripCostEntries.companyId, input.companyId),
          eq(tripCostEntries.tripId, input.tripId),
          eq(tripCostEntries.id, input.entryId),
          isNull(tripCostEntries.removedAt),
        ),
      )
      .returning({ id: tripCostEntries.id })

    return updated !== undefined
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
        entryKindId: tripCostEntries.entryKindId,
        entryKindName: companyEntryKinds.name,
        id: tripCostEntries.id,
        kind: tripCostEntries.kind,
      })
      .from(tripCostEntries)
      .leftJoin(identityUserProfiles, eq(identityUserProfiles.userId, tripCostEntries.actorUserId))
      .leftJoin(companyEntryKinds, eq(companyEntryKinds.id, tripCostEntries.entryKindId))
      .where(
        and(
          eq(tripCostEntries.companyId, input.companyId),
          eq(tripCostEntries.tripId, input.tripId),
          /** Spec 169 RF13: removido não aparece na lista por padrão. */
          isNull(tripCostEntries.removedAt),
        ),
      )
      .orderBy(desc(tripCostEntries.createdAt))

    return rows.map((row) => ({
      actor: { name: resolveActorName(row), userId: row.actorUserId },
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
      description: row.description,
      entryKind:
        row.entryKindId === null || row.entryKindName === null
          ? null
          : { id: row.entryKindId, name: row.entryKindName },
      id: row.id,
      kind: row.kind,
    }))
  }
}
