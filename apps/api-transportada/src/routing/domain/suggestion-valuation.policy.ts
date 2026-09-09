/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 101: a conta do **conjunto** de viagens que a sugestão multi-veículo propõe. Puro — sem I/O,
 * sem banco, sem rede: o que decide aqui é aritmética e vocabulário de ausência.
 */
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import type { TripValuation, ValuationGap } from '../../trips/domain/trip-valuation.policy.js'

const ERROR_CODE_PREFIX = 'SUGGESTION_VALUATION'

/** A perna que a sugestão guardou para uma parada. `null` é ausência — nunca zero. */
export type SuggestionStopRoad = {
  readonly distanceFromPreviousMeters: null | number
  readonly durationFromPreviousSeconds: null | number
}

export type SuggestionVehicleRoad = {
  readonly distanceMeters: null | number
  readonly durationSeconds: null | number
}

export type SuggestionVehicleValuation = {
  readonly distanceMeters: null | number
  readonly documentCount: number
  readonly driverId: null | string
  readonly durationSeconds: null | number
  readonly stopCount: number
  readonly valuation: TripValuation
  readonly vehicleId: string
}

export type SuggestionValuationReport = {
  /** As lacunas do conjunto, deduplicadas: a mesma causa em dois veículos é um motivo, não dois. */
  readonly gaps: readonly ValuationGap[]
  /**
   * ⚠️ O total sozinho mente quando falta parcela. É este campo que obriga a tela a pôr a marca ao
   * lado do lucro, em vez de esconder o número — que seria pior.
   */
  readonly hasGaps: boolean
  readonly totalCost: string
  readonly totalDistanceMeters: null | number
  readonly totalDurationSeconds: null | number
  readonly totalMargin: string
  readonly totalRevenue: string
}

/**
 * A estrada de um veículo: a soma das pernas das paradas dele.
 *
 * ⚠️ **A primeira parada não tem perna anterior**, e a parada excluída da otimização também não —
 * `null` ali é o normal. Mas veículo em que **nenhuma** perna é conhecida tem distância
 * *desconhecida*, não zero: zero desceria o combustível a nada e a margem apareceria melhor do que
 * é, que é o modo de falha que a ADR-0049 §2 proíbe.
 */
export function sumVehicleRoad(stops: readonly SuggestionStopRoad[]): SuggestionVehicleRoad {
  const distances = stops.flatMap((stop) =>
    stop.distanceFromPreviousMeters === null ? [] : [stop.distanceFromPreviousMeters],
  )
  const durations = stops.flatMap((stop) =>
    stop.durationFromPreviousSeconds === null ? [] : [stop.durationFromPreviousSeconds],
  )

  return {
    distanceMeters: distances.length === 0 ? null : distances.reduce(add, 0),
    durationSeconds: durations.length === 0 ? null : durations.reduce(add, 0),
  }
}

/**
 * O relatório do conjunto: quanto a distribuição inteira rende, custa e demora.
 *
 * ⚠️ **Tempo total é a soma, nunca o máximo.** São caminhões distintos rodando em paralelo, e a
 * pergunta que este relatório responde é quanto custa operar o conjunto — não quando o último
 * chega. Se um dia quisermos a segunda pergunta, ela é um campo novo ao lado deste.
 *
 * ⚠️ Veículo sem distância conhecida **contamina o conjunto**: ele entra em `hasGaps` mesmo que a
 * conta dele não tenha lacuna própria, porque um total somado sobre parte dos veículos se apresenta
 * como previsão fechada e não é.
 */
export function buildSuggestionValuationReport(input: {
  readonly vehicles: readonly SuggestionVehicleValuation[]
}): SuggestionValuationReport {
  const { vehicles } = input
  const totalRevenue = sumMoney(vehicles.map((vehicle) => vehicle.valuation.totalRevenue))
  const totalCost = sumMoney(vehicles.map((vehicle) => vehicle.valuation.totalCost))

  const distances = vehicles.flatMap((vehicle) =>
    vehicle.distanceMeters === null ? [] : [vehicle.distanceMeters],
  )
  const durations = vehicles.flatMap((vehicle) =>
    vehicle.durationSeconds === null ? [] : [vehicle.durationSeconds],
  )

  const gaps = [
    ...new Set(
      vehicles.flatMap((vehicle) =>
        vehicle.valuation.costParcels.flatMap((parcel) =>
          parcel.gap === null ? [] : [parcel.gap],
        ),
      ),
    ),
  ]

  const missingRoad = vehicles.some((vehicle) => vehicle.distanceMeters === null)

  return {
    gaps,
    hasGaps: gaps.length > 0 || missingRoad,
    totalCost: formatScaledDecimal(totalCost, MONEY_SCALE),
    totalDistanceMeters: distances.length === 0 ? null : distances.reduce(add, 0),
    totalDurationSeconds: durations.length === 0 ? null : durations.reduce(add, 0),
    totalMargin: formatScaledDecimal(totalRevenue - totalCost, MONEY_SCALE),
    totalRevenue: formatScaledDecimal(totalRevenue, MONEY_SCALE),
  }
}

function add(total: number, value: number): number {
  return total + value
}

function sumMoney(values: readonly string[]): bigint {
  return values.reduce(
    (total, value) =>
      total + parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value }),
    0n,
  )
}
