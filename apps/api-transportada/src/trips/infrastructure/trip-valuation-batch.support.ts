/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259: as leituras **por viagem** de `DrizzleTripValuationQuery.readContext`, feitas para a página
 * inteira de uma vez — uma consulta por leitura, agrupada em memória por `trip_id`. Cada função é o
 * espelho da sua versão singular; o teste de paridade lista × detalhe é quem prova que não divergem.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sum } from 'drizzle-orm'

import { deliveryCharges } from '../../database/delivery-client.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { tripCostEntries } from '../../database/trip-financial.schema.js'
import { tripDrivers, tripStopEvents, tripStops } from '../../database/trip.schema.js'
import type { ApportionmentStop } from '../domain/document-cost-apportionment.types.js'
import {
  EVENT_CLOCKS,
  resolveStopDwells,
  STOP_DWELL_EVENT_KINDS,
  type StopDwellEvent,
  type StopDwellEventKind,
} from '../domain/stop-dwell.policy.js'
import type { TripCrewMember } from '../domain/trip-driver-cost.policy.js'
import type { TripHelperCostMember } from '../domain/trip-helper-cost.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type BatchInput = { readonly companyId: string; readonly tripIds: readonly string[] }

const DWELL_EVENT_KINDS: readonly StopDwellEventKind[] = Object.values(STOP_DWELL_EVENT_KINDS)
const COUNTED_DELIVERY_CHARGE_STATUSES = [
  'recorded',
  'submitted',
  'approved',
  'reimbursed',
] as const

function groupByTrip<TRow extends { readonly tripId: string }, TValue>(
  rows: readonly TRow[],
  toValue: (row: TRow) => TValue,
): ReadonlyMap<string, readonly TValue[]> {
  const grouped = new Map<string, TValue[]>()
  for (const row of rows) {
    const bucket = grouped.get(row.tripId)
    if (bucket === undefined) grouped.set(row.tripId, [toValue(row)])
    else bucket.push(toValue(row))
  }

  return grouped
}

/** Espelha `readCrew`: só `role = 'driver'`, na ordem que a viagem gravou. */
export async function readCrewByTrip(
  database: Database,
  input: BatchInput,
): Promise<ReadonlyMap<string, readonly TripCrewMember[]>> {
  const rows = await database
    .select({
      driverAmount: fleetDrivers.dailyAllowanceAmount,
      driverId: fleetDrivers.id,
      driverName: fleetDrivers.name,
      paymentModel: fleetDrivers.paymentModel,
      tripId: tripDrivers.tripId,
    })
    .from(tripDrivers)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .where(
      and(
        eq(tripDrivers.companyId, input.companyId),
        inArray(tripDrivers.tripId, [...input.tripIds]),
        eq(tripDrivers.role, 'driver'),
      ),
    )
    .orderBy(asc(tripDrivers.position))

  return groupByTrip(rows, (row) => ({
    driverAmount: row.driverAmount,
    driverId: row.driverId,
    driverName: row.driverName,
    paymentModel: row.paymentModel,
  }))
}

/** Espelha `readHelperCrew`: só `role = 'helper'`, com a diária própria da ficha. */
export async function readHelperCrewByTrip(
  database: Database,
  input: BatchInput,
): Promise<ReadonlyMap<string, readonly TripHelperCostMember[]>> {
  const rows = await database
    .select({
      driverId: fleetDrivers.id,
      ownDailyRate: fleetDrivers.helperDailyRate,
      tripId: tripDrivers.tripId,
    })
    .from(tripDrivers)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .where(
      and(
        eq(tripDrivers.companyId, input.companyId),
        inArray(tripDrivers.tripId, [...input.tripIds]),
        eq(tripDrivers.role, 'helper'),
      ),
    )

  return groupByTrip(rows, (row) => ({ driverId: row.driverId, ownDailyRate: row.ownDailyRate }))
}

/**
 * Espelha `readTollTotal` e `readManualCostTotal` numa consulta só: o pedágio lançado (`toll`) e o
 * avulso (`other`) são parcelas diferentes (spec 143 D6), por isso saem em mapas separados. Viagem
 * sem lançamento não entra no mapa — ausência de lançamento, não gratuidade.
 */
export async function readRecordedCostTotalsByTrip(
  database: Database,
  input: BatchInput,
): Promise<{
  readonly manualByTrip: ReadonlyMap<string, string>
  readonly tollByTrip: ReadonlyMap<string, string>
}> {
  const rows = await database
    .select({
      kind: tripCostEntries.kind,
      total: sum(tripCostEntries.amount),
      tripId: tripCostEntries.tripId,
    })
    .from(tripCostEntries)
    .where(
      and(
        eq(tripCostEntries.companyId, input.companyId),
        inArray(tripCostEntries.tripId, [...input.tripIds]),
        inArray(tripCostEntries.kind, ['toll', 'other']),
      ),
    )
    .groupBy(tripCostEntries.tripId, tripCostEntries.kind)

  const tollByTrip = new Map<string, string>()
  const manualByTrip = new Map<string, string>()
  for (const row of rows) {
    if (row.total === null) continue
    if (row.kind === 'toll') tollByTrip.set(row.tripId, row.total)
    else manualByTrip.set(row.tripId, row.total)
  }

  return { manualByTrip, tollByTrip }
}

/** Espelha `readDeliveryChargesTotal`: só as taxas que já passaram por gente. */
export async function readDeliveryChargeTotalsByTrip(
  database: Database,
  input: BatchInput,
): Promise<ReadonlyMap<string, string>> {
  const rows = await database
    .select({ total: sum(deliveryCharges.amount), tripId: deliveryCharges.tripId })
    .from(deliveryCharges)
    .where(
      and(
        eq(deliveryCharges.companyId, input.companyId),
        inArray(deliveryCharges.tripId, [...input.tripIds]),
        inArray(deliveryCharges.status, [...COUNTED_DELIVERY_CHARGE_STATUSES]),
      ),
    )
    .groupBy(deliveryCharges.tripId)

  return new Map(
    rows.flatMap((row) =>
      row.tripId === null || row.total === null ? [] : [[row.tripId, row.total] as const],
    ),
  )
}

/** Espelha `readStopDwells`: as paradas na ordem da rota com a espera de cada uma, por viagem. */
export async function readStopDwellsByTrip(
  database: Database,
  input: BatchInput,
): Promise<ReadonlyMap<string, readonly ApportionmentStop[]>> {
  const rows = await database
    .select({
      channel: tripStopEvents.channel,
      createdAt: tripStopEvents.createdAt,
      kind: tripStopEvents.kind,
      stopId: tripStops.id,
      tappedAt: tripStopEvents.tappedAt,
      tripId: tripStops.tripId,
    })
    .from(tripStops)
    .leftJoin(
      tripStopEvents,
      and(
        eq(tripStopEvents.companyId, tripStops.companyId),
        eq(tripStopEvents.stopId, tripStops.id),
        inArray(tripStopEvents.kind, [...DWELL_EVENT_KINDS]),
      ),
    )
    .where(
      and(eq(tripStops.companyId, input.companyId), inArray(tripStops.tripId, [...input.tripIds])),
    )
    .orderBy(asc(tripStops.tripId), asc(tripStops.sequence))

  return new Map(
    [...groupByTrip(rows, (row) => row)].map(([tripId, tripRows]) => {
      const stopIds = [...new Set(tripRows.map((row) => row.stopId))]
      const events = tripRows.flatMap((row): StopDwellEvent[] =>
        row.kind === null || row.createdAt === null
          ? []
          : [
              {
                channel: row.channel,
                clock: row.tappedAt === null ? EVENT_CLOCKS.server : EVENT_CLOCKS.device,
                kind: row.kind as StopDwellEventKind,
                /** A hora do toque vence a do servidor: a fila offline chega depois do fato. */
                occurredAt: row.tappedAt ?? row.createdAt,
                stopId: row.stopId,
              },
            ],
      )

      return [tripId, resolveStopDwells({ events, stopIds })] as const
    }),
  )
}
