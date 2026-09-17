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
import type { RouteOptionVehicle } from '../../toll-booths/domain/route-option.policy.js'
import type { AxleCount, TollRouteCost } from '../../toll-booths/domain/toll-route-cost.policy.js'
import type { RouteOptionVehicle } from '../../toll-booths/domain/route-option.policy.js'

/** Sem escolha declarada, RF3 default é o mesmo da leitura: mais barata conhecida, sem assinatura. */
const DEFAULT_ROUTE_CHOICE_CRITERION: RouteChoiceCriterion = 'cheapest'

export type FreezeTripPlannedRouteVehicleContext = {
  readonly axles: AxleCount | null
  /**
   * Consumo e preço do combustível do veículo da viagem — a mesma fonte da leitura ao vivo. Sem
   * eles nenhuma opção tem custo, e o critério `cheapest` cai na principal com `reproduced: false`.
   */
  readonly fuelBaseline: RouteOptionVehicle
  /** A categoria do veículo — anda junto de `axles`, e é ela que multiplica a tarifa base. */
  readonly multiplier: TollMultiplier | null
  readonly hasAutomaticTollPayment: boolean
  /**
   * spec 153 H1: o consumo e o preço do combustível do veículo — sem isto `readRouteGeometry`
   * não sabe comparar `totalCost` entre as opções, `applyCriterion('cheapest')` não acha
   * candidata nenhuma, e a rota congelada cai sempre na principal com `choiceReproduced: false`,
   * mesmo quando ninguém pediu assinatura nenhuma. Ausência de dado é `{ kilometersPerLiter: null,
   * pricePerLiter: null }` — nunca um consumo inventado.
   */
  readonly fuelBaseline: RouteOptionVehicle
  /**
   * Spec 153 T704 (M3): a revisão da viagem no instante em que o congelamento foi disparado —
   * `trips.updated_at`. A escrita final só acontece se ela ainda for essa, de forma que um
   * congelamento nascido de um conjunto de paradas já obsoleto não escreva nada em vez de
   * sobrescrever a rota que o reordenamento seguinte acabou de calcular ("last write wins").
   *
   * ⚠️ É **texto**, não `Date`: `timestamptz` guarda microssegundo e o `Date` do JavaScript só vai
   * até o milissegundo. Comparar o valor lido de volta como `Date` nunca reencontrava a linha, e o
   * congelamento deixava de escrever sempre — a guarda vira apagador silencioso da rota inteira.
   */
  readonly revision: string
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
  /**
   * L5 (revisão final da 153): se a opção congelada veio da chamada `exclude=toll` (RF2) — antes
   * ficava de fora do que se gravava, e a leitura congelada sempre fixava `false`, mesmo quando a
   * viagem era mesmo a rota sem pedágio.
   */
  isNoToll: boolean
  legs: RouteGeometryView['legs']
  points: RouteGeometryView['points']
  returnDistanceMeters: number
  /** A identidade da rota que **se congelou** — não a que o pedido pediu (D3 pode discordar). */
  signature: null | string
}>

export type WritePlannedRouteInput = {
  readonly companyId: string
  /** T704 M3: a revisão lida no disparo — compare-and-set, nunca escrita incondicional. */
  readonly expectedRevision: string
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
  /** `null` é T704 M4: alguma parada sem coordenada — sem rota, nunca a rota das outras. */
  readStopCoordinates(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly RouteGeometryPoint[] | null>
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

/**
 * `routeFrozen: false` cobre os dois jeitos de sair sem roteiro: a viagem sumiu antes de ler o
 * veículo, ou o roteirizador não devolveu uma rota que sustente `route_planned` (D5) — em ambos,
 * quem congelou por cima da transição de status (`plan-trip-route.use-case.ts`) precisa saber que
 * não há o que status afirmar.
 */
export async function freezeTripPlannedRoute(
  input: FreezeTripPlannedRouteInput,
): Promise<{ readonly routeFrozen: boolean }> {
  const vehicle = await input.repository.readVehicleContext(input)
  if (vehicle === null) return { routeFrozen: false }

  const stops = await input.repository.readStopCoordinates(input)
  /**
   * T704 M4 (caso extremo da spec): parada sem coordenada é o mesmo desfecho de estrada
   * indisponível — rota e pedágio nulos juntos (D5). Traçar com o subconjunto geocodificado
   * gravaria uma distância parcial, e ela alimenta combustível e valoração sem se anunciar.
   */
  if (stops === null) {
    await input.repository.writePlannedRoute({
      companyId: input.companyId,
      expectedRevision: vehicle.revision,
      route: null,
      toll: null,
      tripId: input.tripId,
    })
    return
  }

  const road = await readRouteGeometry({
    axles: vehicle.axles,
    ...(input.choice === undefined ? {} : { choice: input.choice }),
    depot: input.depot ?? null,
    fuelBaseline: vehicle.fuelBaseline,
    geometry: input.geometry,
    hasAutomaticTollPayment: vehicle.hasAutomaticTollPayment,
    multiplier: vehicle.multiplier,
    stops,
    tollBooths: input.tollBooths,
  })

  const route = toFrozenRoute({
    criterion: input.choice?.criterion ?? DEFAULT_ROUTE_CHOICE_CRITERION,
    road,
  })

  await input.repository.writePlannedRoute({
    companyId: input.companyId,
    expectedRevision: vehicle.revision,
    route,
    toll: toFrozenToll(road.toll),
    tripId: input.tripId,
  })

  return { routeFrozen: route !== null }
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
    isNoToll: selected.isNoToll,
    legs: road.legs,
    points: road.points,
    returnDistanceMeters: distance.returnDistanceMeters,
    signature: selected.signature,
  }
}

/**
 * `RouteGeometryToll` carrega `tariffObservedOn`/`catalog` — leitura fresca do catálogo, não parte
 * da decisão congelada — e por isso não entram no que se grava.
 *
 * ⚠️ `toll.booths` já é `TollBoothRouteLine[]` (a linha do extrato, com `legIndex` — ver
 * `read-route-geometry.use-case.ts`), mais rica do que `TollBoothRecord[]` que o tipo de
 * `TollRouteCost` declara para `booths`. `legIndex` viaja junto de propósito, mesmo fora do tipo: é
 * o que a leitura congelada (L5 da revisão final da 153) volta a extrair de cada praça —
 * `parseFrozenBoothLegIndexes`, em `toll-route-cost-snapshot.policy.ts`.
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
