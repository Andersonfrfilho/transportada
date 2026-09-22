/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha da estrada da viagem já criada, servindo a rota **congelada** quando ela existe (spec 153
 * T203) — nunca recalculando ao vivo uma rota que já precificou e despachou a viagem em cima de um
 * traçado específico (D4). Sem congelamento — rascunho, OSRM fora do ar na hora de congelar (D5), ou
 * viagem anterior à spec (D8) — cai para a mesma leitura ao vivo de `readRouteGeometry`.
 */
import {
  describeTollBoothCharges,
  type TollRouteCost,
} from '../../toll-booths/domain/toll-route-cost.policy.js'
import { formatTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { resolveTollCatalogStatus } from '../../toll-booths/domain/toll-catalog-status.policy.js'
import {
  NO_FUEL_BASELINE,
  rankRouteOptions,
  type RouteOptionVehicle,
} from '../../toll-booths/domain/route-option.policy.js'
import { summarizeRoadDistance } from '../domain/planned-road-distance.policy.js'
import type { RouteChoiceCriterion } from '../domain/route-choice.policy.js'
import type {
  ReadRouteGeometryTollBoothsPort,
  RouteGeometryOption,
  RouteGeometryToll,
  RouteGeometryView,
} from './read-route-geometry.use-case.js'

export type StoredTripRoute = Readonly<{
  choiceReproduced: boolean
  criterion: RouteChoiceCriterion
  depot: RouteGeometryView['depot']
  distanceMeters: number
  durationSeconds: number
  legs: RouteGeometryOption['legs']
  points: RouteGeometryOption['points']
  returnDistanceMeters: number
  signature: null | string
  toll: null | TollRouteCost
}>

export type ReadTripRouteGeometryRoutePort = {
  readFrozenRoute(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | StoredTripRoute>
  /**
   * O consumo e o preço **de hoje** do veículo da viagem — o traçado é o congelado, o custo não.
   * `null` quando a viagem não tem veículo lido; aí o custo sai com `NO_FUEL_BASELINE`.
   */
  readVehicleContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | Readonly<{ fuelBaseline: RouteOptionVehicle }>>
}

export type TripRouteGeometryView = RouteGeometryView &
  Readonly<{
    criterion: null | RouteChoiceCriterion
    distanceMeters: null | number
    durationSeconds: null | number
    frozen: boolean
    returnDistanceMeters: null | number
    signature: null | string
  }>

export type ReadTripRouteGeometryInput = {
  readonly companyId: string
  readonly now?: () => Date
  readonly readLiveRoute: () => Promise<RouteGeometryView>
  readonly route: ReadTripRouteGeometryRoutePort
  readonly tollBooths: null | ReadRouteGeometryTollBoothsPort
  readonly tripId: string
}

export async function readTripRouteGeometry(
  input: ReadTripRouteGeometryInput,
): Promise<TripRouteGeometryView> {
  const now = input.now ?? (() => new Date())
  const stored = await input.route.readFrozenRoute({
    companyId: input.companyId,
    tripId: input.tripId,
  })
  if (stored === null) return toLiveView({ live: await input.readLiveRoute() })

  const [toll, vehicle] = await Promise.all([
    enrichFrozenToll({ now, toll: stored.toll, tollBooths: input.tollBooths }),
    input.route.readVehicleContext({ companyId: input.companyId, tripId: input.tripId }),
  ])
  return toFrozenView({ fuelBaseline: vehicle?.fuelBaseline ?? NO_FUEL_BASELINE, stored, toll })
}

function toLiveView(input: { readonly live: RouteGeometryView }): TripRouteGeometryView {
  const selected =
    input.live.selectedIndex === null
      ? null
      : (input.live.options[input.live.selectedIndex] ?? null)
  const distance = summarizeRoadDistance({
    legs: input.live.legs,
    trailingLegs: input.live.depot?.trailingLegs ?? 0,
  })

  return {
    ...input.live,
    criterion: null,
    distanceMeters: distance.distanceMeters,
    durationSeconds: distance.durationSeconds,
    frozen: false,
    returnDistanceMeters: distance.returnDistanceMeters,
    signature: selected?.signature ?? null,
  }
}

/**
 * ⚠️ O custo da rota congelada sai da **mesma** conta da leitura ao vivo (`rankRouteOptions`), nunca
 * de uma segunda: fixá-lo em `null` fazia o detalhe imprimir "Não calculado" sem motivo nenhum, com
 * o consumo e o preço cadastrados. Sem eles, `costGap` diz qual dos dois faltou.
 */
function toFrozenView(input: {
  readonly fuelBaseline: RouteOptionVehicle
  readonly stored: StoredTripRoute
  readonly toll: null | RouteGeometryToll
}): TripRouteGeometryView {
  const ranking = rankRouteOptions({
    options: [
      {
        distanceMeters: input.stored.distanceMeters,
        durationSeconds: input.stored.durationSeconds,
        tollTotal: input.toll?.total ?? null,
      },
    ],
    vehicle: input.fuelBaseline,
  })
  const option: RouteGeometryOption = {
    distanceMeters: input.stored.distanceMeters,
    durationSeconds: input.stored.durationSeconds,
    fuelTotal: ranking.options[0]?.fuelTotal ?? null,
    isNoToll: false,
    legs: input.stored.legs,
    points: input.stored.points,
    signature: input.stored.signature,
    toll: input.toll,
    totalCost: ranking.options[0]?.totalCost ?? null,
  }

  return {
    cheapestIndex: ranking.cheapestIndex,
    choiceReproduced: input.stored.choiceReproduced,
    costGap: ranking.costGap,
    criterion: input.stored.criterion,
    depot: input.stored.depot,
    distanceMeters: input.stored.distanceMeters,
    durationSeconds: input.stored.durationSeconds,
    fastestIndex: ranking.fastestIndex,
    frozen: true,
    hasChoice: false,
    legs: option.legs,
    options: [option],
    points: option.points,
    returnDistanceMeters: input.stored.returnDistanceMeters,
    selectedIndex: 0,
    signature: input.stored.signature,
    source: 'road',
    toll: option.toll,
  }
}

/**
 * O extrato (`describeTollBoothCharges`) é puro sobre o que já foi congelado — nunca reprecifica a
 * praça. Só `catalog`/`tariffObservedOn` pedem leitura fresca (mesmo tratamento do use case ao
 * vivo): são metadados de hoje sobre um pedágio de ontem, não o preço em si.
 */
async function enrichFrozenToll(input: {
  readonly now: () => Date
  readonly toll: null | TollRouteCost
  readonly tollBooths: null | ReadRouteGeometryTollBoothsPort
}): Promise<null | RouteGeometryToll> {
  if (input.toll === null) return null
  const toll = input.toll
  const nodeIds = toll.booths.map((booth) => booth.osmNodeId)
  const [records, catalogSummary] = await Promise.all([
    input.tollBooths === null ? Promise.resolve([]) : input.tollBooths.readByNodeIds(nodeIds),
    input.tollBooths === null
      ? Promise.resolve({ boothCount: 0, latestObservedOn: null })
      : input.tollBooths.readCatalogSummary(),
  ])
  const observedOnByNode = new Map(records.map((record) => [record.osmNodeId, record.observedOn]))
  const observedDates = toll.booths
    .map((booth) => observedOnByNode.get(booth.osmNodeId))
    .filter((value): value is string => value !== undefined)
    .sort()

  return {
    ...toll,
    booths: describeTollBoothCharges({
      booths: toll.booths,
      multiplier: toll.multiplier,
      paymentMode: toll.paymentMode,
    }).map((booth) => ({ ...booth, legIndex: null })),
    catalog: resolveTollCatalogStatus({ summary: catalogSummary, today: input.now() }),
    multiplierLabel: formatTollMultiplier(toll.multiplier),
    tariffObservedOn: observedDates[0] ?? null,
  }
}
