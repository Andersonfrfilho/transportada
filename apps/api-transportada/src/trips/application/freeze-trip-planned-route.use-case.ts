/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T201 (substitui a spec 090 T11): a rota nasce inteira numa escrita só — traçado,
 * pernas, métricas e a decisão de qual opção foi escolhida —, com o pedágio de sempre ao lado
 * (D4). Continua rodando na mesma chamada que planeja o roteiro: recalcular depois separaria a
 * rota de hoje da distância de ontem, a mesma divergência que a spec 090 já evitava.
 *
 * ⚠️ O pedágio congelado não mora dentro de `planned_route` — ele é a coluna `planned_toll` de
 * sempre (spec 090), gravada **na mesma escrita** que esta, nunca numa segunda chamada que
 * poderia discordar (`trip.schema.ts`, comentário de `plannedRoute`).
 */
import {
  readRouteGeometry,
  type ReadRouteGeometryDepotPort,
  type ReadRouteGeometryTollBoothsPort,
  type RouteGeometryToll,
  type RouteGeometryView,
} from './read-route-geometry.use-case.js'
import type { RouteGeometryPort } from './route-geometry.port.js'
import { summarizeRoadDistance } from '../domain/planned-road-distance.policy.js'
import type { RouteChoice, RouteChoiceCriterion } from '../domain/route-choice.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { TollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import type { AxleCount, TollRouteCost } from '../../toll-booths/domain/toll-route-cost.policy.js'

/** Sem escolha declarada, RF3 default é o mesmo da leitura: mais barata conhecida, sem assinatura. */
const DEFAULT_ROUTE_CHOICE_CRITERION: RouteChoiceCriterion = 'cheapest'

export type FreezeTripPlannedRouteVehicleContext = {
  readonly axles: AxleCount | null
  /** A categoria do veículo — anda junto de `axles`, e é ela que multiplica a tarifa base. */
  readonly multiplier: TollMultiplier | null
  readonly hasAutomaticTollPayment: boolean
}

/**
 * O que se congela do traçado. `distanceMeters`/`durationSeconds`/`returnDistanceMeters` viram
 * colunas próprias (T101) — só o repositório sabe disso; aqui é só o resultado.
 */
export type FrozenPlannedRoute = Readonly<{
  choiceReproduced: boolean
  criterion: RouteChoiceCriterion
  depot: RouteGeometryView['depot']
  distanceMeters: number
  durationSeconds: number
  legs: RouteGeometryView['legs']
  points: RouteGeometryView['points']
  returnDistanceMeters: number
  /** A identidade da rota que **se congelou** — não a que o pedido pediu (D3 pode discordar). */
  signature: null | string
}>

export type WritePlannedRouteInput = {
  readonly companyId: string
  /** `null` é D5: a estrada não veio, e nada se afirma sobre a rota — nunca zero. */
  readonly route: FrozenPlannedRoute | null
  readonly toll: null | TollRouteCost
  readonly tripId: string
}

export type FreezeTripPlannedRoutePort = {
  /** `null` quando a viagem sumiu entre o gate do planejamento e aqui — não há o que congelar. */
  readVehicleContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FreezeTripPlannedRouteVehicleContext | null>
  readStopCoordinates(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly RouteGeometryPoint[]>
  /**
   * Uma escrita só (D4): rota, métricas e pedágio, com um `frozen_at` compartilhado por grupo —
   * nunca duas chamadas que poderiam deixar a viagem com metade nova e metade velha.
   */
  writePlannedRoute(input: WritePlannedRouteInput): Promise<void>
}

export type FreezeTripPlannedRouteInput = {
  /** Qual rota reproduzir (spec 153 D2/D3). Ausente é `cheapest`/sem assinatura (RF3). */
  readonly choice?: RouteChoice
  readonly companyId: string
  readonly depot?: null | ReadRouteGeometryDepotPort
  readonly geometry: RouteGeometryPort
  readonly repository: FreezeTripPlannedRoutePort
  readonly tollBooths: ReadRouteGeometryTollBoothsPort
  readonly tripId: string
}

export async function freezeTripPlannedRoute(input: FreezeTripPlannedRouteInput): Promise<void> {
  const vehicle = await input.repository.readVehicleContext(input)
  if (vehicle === null) return

  const stops = await input.repository.readStopCoordinates(input)

  const road = await readRouteGeometry({
    axles: vehicle.axles,
    ...(input.choice === undefined ? {} : { choice: input.choice }),
    depot: input.depot ?? null,
    geometry: input.geometry,
    hasAutomaticTollPayment: vehicle.hasAutomaticTollPayment,
    multiplier: vehicle.multiplier,
    stops,
    tollBooths: input.tollBooths,
  })

  await input.repository.writePlannedRoute({
    companyId: input.companyId,
    route: toFrozenRoute({
      criterion: input.choice?.criterion ?? DEFAULT_ROUTE_CHOICE_CRITERION,
      road,
    }),
    toll: toFrozenToll(road.toll),
    tripId: input.tripId,
  })
}

/**
 * `source === 'unavailable'` é a única forma de rota nula por falta de estrada (D5). As três
 * métricas nascem juntas (T101 CHECK): se qualquer uma vier desconhecida — inclusive um
 * descompasso entre `trailingLegs` e as pernas medidas —, a rota inteira grava `null` em vez de
 * afirmar duas métricas e calar a terceira.
 */
function toFrozenRoute(input: {
  readonly criterion: RouteChoiceCriterion
  readonly road: RouteGeometryView
}): FrozenPlannedRoute | null {
  const { criterion, road } = input
  if (road.source === 'unavailable') return null

  const selected = road.selectedIndex === null ? undefined : road.options[road.selectedIndex]
  if (selected === undefined) return null

  const distance = summarizeRoadDistance({
    legs: road.legs,
    trailingLegs: road.depot?.trailingLegs ?? 0,
  })
  if (distance.distanceMeters === null || distance.durationSeconds === null) return null
  if (distance.returnDistanceMeters === null) return null

  return {
    choiceReproduced: road.choiceReproduced,
    criterion,
    depot: road.depot,
    distanceMeters: distance.distanceMeters,
    durationSeconds: distance.durationSeconds,
    legs: road.legs,
    points: road.points,
    returnDistanceMeters: distance.returnDistanceMeters,
    signature: selected.signature,
  }
}

/**
 * `RouteGeometryToll` carrega `tariffObservedOn`/`booths`/`catalog` — leitura fresca do catálogo,
 * não parte da decisão congelada — e por isso não entram no que se grava.
 */
function toFrozenToll(toll: null | RouteGeometryToll): null | TollRouteCost {
  if (toll === null) return null

  return {
    axles: toll.axles,
    booths: toll.booths,
    boothsFallenBackToManual: toll.boothsFallenBackToManual,
    boothsWithoutCharge: toll.boothsWithoutCharge,
    chargePerAxle: toll.chargePerAxle,
    /** ⚠️ O multiplicador entra no congelado: sem ele o total gravado fica sem a conta que o gerou. */
    multiplier: toll.multiplier,
    paymentMode: toll.paymentMode,
    total: toll.total,
  }
}
