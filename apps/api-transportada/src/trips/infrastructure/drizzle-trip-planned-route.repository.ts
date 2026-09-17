/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T201 (substitui a spec 090 T11): lê o veículo da viagem para saber o eixo, se ela paga
 * com tag e quanto o combustível custa, e grava a rota planejada inteira — traçado, métricas e
 * pedágio — numa única escrita.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { trips } from '../../database/trip.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import {
  parseFrozenBoothLegIndexes,
  parseTollRouteCost,
} from '../../toll-booths/domain/toll-route-cost-snapshot.policy.js'
import { resolveDeclaredTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type {
  ReadTripRouteGeometryRoutePort,
  StoredTripRoute,
} from '../application/read-trip-route-geometry.use-case.js'
import type { RouteGeometryView } from '../application/read-route-geometry.use-case.js'
import type {
  FreezeTripPlannedRoutePort,
  FreezeTripPlannedRouteVehicleContext,
  PlannedRouteWriteOutcome,
  WritePlannedRouteInput,
} from '../application/freeze-trip-planned-route.use-case.js'
import { TRIP_STATUSES_BEFORE_DISPATCH } from '../domain/trip-state.policy.js'
import { parsePlannedRoute } from '../domain/parse-planned-route.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import { resolveVehicleFuelBaseline } from './effective-fuel-price.query.js'
import { listTripStopCoordinates } from './trip-stop-coordinates.support.js'
import type { TripDatabase } from './trip-queryable.type.js'

/**
 * Spec 153 T802 (N3): a revisão do **conjunto de paradas**, não da linha `trips` inteira.
 * `trips.updated_at` (T704 M3) parecia servir, mas qualquer escrita alheia em `trips` — relato de
 * campo do motorista, override de MDF-e, o próprio despacho — também a tocava, e o compare-and-set
 * descartava um congelamento legítimo por uma mudança que nunca mexeu em parada. `planned_route_
 * stops_revision` só muda pelo trigger de `trip_stops` (migration
 * `20260917202034_trip_planned_route_stops_revision`); é `bigint`, então nunca esbarra na
 * imprecisão de `timestamptz`-como-texto que o `updated_at` tinha.
 */
const TRIP_REVISION = sql<string>`${trips.plannedRouteStopsRevision}::text`

export class DrizzleTripPlannedRouteRepository
  implements FreezeTripPlannedRoutePort, ReadTripRouteGeometryRoutePort
{
  public constructor(private readonly database: TripDatabase) {}

  public async readVehicleContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FreezeTripPlannedRouteVehicleContext | null> {
    const [row] = await this.database
      .select({
        averageConsumption: fleetVehicles.averageConsumption,
        axleCount: fleetVehicles.axleCount,
        fuelType: fleetVehicles.fuelType,
        hasAutomaticTollPayment: fleetVehicles.hasAutomaticTollPayment,
        kilometersPerLiter: fleetVehicles.averageConsumption,
        /** T704 M3 / T802: a revisão das paradas neste instante, que a escrita final reconfere. */
        revision: TRIP_REVISION,
        vehicleType: fleetVehicles.vehicleType,
      })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (row === undefined) return null

    /** O mesmo seam da leitura ao vivo (`route-geometry-vehicle-axles.query.ts`). */
    const fuelBaseline = await resolveVehicleFuelBaseline({
      companyId: input.companyId,
      database: this.database,
      fuelType: row.fuelType,
      kilometersPerLiter: row.kilometersPerLiter,
    })

    return {
      axles: resolveDeclaredVehicleAxles(row),
      fuelBaseline,
      /** A categoria sai do mesmo `row` que os eixos: as duas descrevem o mesmo veículo. */
      multiplier: resolveDeclaredTollMultiplier(row),
      hasAutomaticTollPayment: row.hasAutomaticTollPayment,
      revision: row.revision,
    }
  }

  public async readStopCoordinates(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly RouteGeometryPoint[] | null> {
    return listTripStopCoordinates(this.database, input)
  }

  /**
   * Rota, métricas e pedágio na mesma chamada (D4) — nunca duas escritas que poderiam deixar a
   * viagem com um traçado novo e um pedágio velho, ou vice-versa.
   *
   * ⚠️ Spec 153 T704 (M3) / T802 (N3): a escrita é **condicional**, por duas razões que o filtro
   * por empresa e id não cobria.
   *
   * - Status: o congelamento é lento (roteirizador, catálogo de praças) e roda fora da transação.
   *   Um despacho no meio do caminho deixava a escrita atrasada sobrescrever o roteiro que já
   *   estava na rua.
   * - Revisão: dois recálculos concorrentes — reordenar parada e reordenar de novo logo em seguida
   *   — terminavam em "last write wins", e o vencedor podia ser o que traçou a sequência antiga.
   *   Comparando a revisão das paradas com o valor lido no disparo, o obsoleto afeta zero linhas e
   *   a viagem fica com a rota do recálculo mais novo (ou nula, que é o estado honesto da D5).
   *
   * T802: o UPDATE afetar zero linhas **não é mais mudo**. `freeze-trip-planned-route.use-case.ts`
   * olha o retorno e lança quando ele não é `'written'` — sempre dentro de `freezeTripRouteGracefully`
   * (T704 L7), que converte em `logger.warn` com o motivo, nunca em falha visível ao operador.
   */
  public async writePlannedRoute(input: WritePlannedRouteInput): Promise<PlannedRouteWriteOutcome> {
    const written = await this.database
      .update(trips)
      .set(plannedRouteColumns({ route: input.route, toll: input.toll }))
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.id, input.tripId),
          eq(TRIP_REVISION, input.expectedRevision),
          inArray(trips.status, [...TRIP_STATUSES_BEFORE_DISPATCH]),
        ),
      )
      .returning({ id: trips.id })
    if (written.length > 0) return 'written'

    return this.diagnosePlannedRouteWriteDiscard(input)
  }

  /**
   * T802: só roda no caminho frio (o UPDATE já falhou) — decide entre as duas causas que o filtro
   * misturava numa linha só, para o log distinguir "a rota mudou enquanto congelava" de "a viagem
   * já tinha saído para a rua".
   */
  private async diagnosePlannedRouteWriteDiscard(
    input: WritePlannedRouteInput,
  ): Promise<PlannedRouteWriteOutcome> {
    const [current] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (current === undefined) return 'stale_revision'

    return (TRIP_STATUSES_BEFORE_DISPATCH as readonly string[]).includes(current.status)
      ? 'stale_revision'
      : 'status_not_before_dispatch'
  }

  /**
   * Spec 153 T203: `depot` sai só do que a própria escrita de T201 gravou (nunca payload externo),
   * então basta a checagem estrutural leve — a validação funda mora no domínio, para `legs`/`points`.
   */
  public async readFrozenRoute(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<StoredTripRoute | null> {
    const [row] = await this.database
      .select({
        plannedDistanceMeters: trips.plannedDistanceMeters,
        plannedDurationSeconds: trips.plannedDurationSeconds,
        plannedReturnDistanceMeters: trips.plannedReturnDistanceMeters,
        plannedRoute: trips.plannedRoute,
        plannedRouteFrozenAt: trips.plannedRouteFrozenAt,
        plannedToll: trips.plannedToll,
        plannedTollFrozenAt: trips.plannedTollFrozenAt,
      })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (row === undefined || row.plannedRouteFrozenAt === null) return null
    if (
      row.plannedDistanceMeters === null ||
      row.plannedDurationSeconds === null ||
      row.plannedReturnDistanceMeters === null
    )
      return null

    const parsedRoute = parsePlannedRoute(row.plannedRoute)
    if (parsedRoute === null) return null

    return {
      boothLegIndexByNode:
        row.plannedTollFrozenAt === null ? new Map() : parseFrozenBoothLegIndexes(row.plannedToll),
      choiceReproduced: parsedRoute.choiceReproduced,
      criterion: parsedRoute.criterion,
      depot: readPlannedRouteDepot(row.plannedRoute),
      distanceMeters: row.plannedDistanceMeters,
      durationSeconds: row.plannedDurationSeconds,
      isNoToll: parsedRoute.isNoToll,
      legs: parsedRoute.legs,
      points: parsedRoute.points,
      returnDistanceMeters: row.plannedReturnDistanceMeters,
      signature: parsedRoute.signature,
      toll: row.plannedTollFrozenAt === null ? null : parseTollRouteCost(row.plannedToll),
    }
  }
}

function readPlannedRouteDepot(value: unknown): RouteGeometryView['depot'] {
  if (typeof value !== 'object' || value === null) return null
  const depot = (value as Record<string, unknown>).depot
  if (typeof depot !== 'object' || depot === null) return null
  return depot as RouteGeometryView['depot']
}

/**
 * Spec 153 D4: rota, métricas e pedágio são **um** conjunto de colunas — nunca duas escritas que
 * poderiam deixar a viagem com traçado novo e pedágio velho. Esta função é esse conjunto, e existe
 * para o congelamento (`writePlannedRoute`) e a limpeza (`clearPlannedRoute`, spec 217 D3) não terem
 * listas separadas.
 */
function plannedRouteColumns(input: {
  readonly route: WritePlannedRouteInput['route']
  readonly toll: WritePlannedRouteInput['toll']
}) {
  const { route, toll } = input

  return {
    plannedDistanceMeters: route === null ? null : route.distanceMeters,
    plannedDurationSeconds: route === null ? null : route.durationSeconds,
    plannedReturnDistanceMeters: route === null ? null : route.returnDistanceMeters,
    plannedRoute:
      route === null
        ? null
        : {
            choiceReproduced: route.choiceReproduced,
            criterion: route.criterion,
            depot: route.depot,
            isNoToll: route.isNoToll,
            legs: route.legs,
            points: route.points,
            signature: route.signature,
          },
    plannedRouteFrozenAt: route === null ? null : sql`now()`,
    plannedToll: toll,
    plannedTollFrozenAt: toll === null ? null : sql`now()`,
    updatedAt: sql`now()`,
  }
}
