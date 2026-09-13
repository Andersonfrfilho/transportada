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
  /** O tempo parado gravado pelo worker. Nulo é parada sem serviço registrado, somada como zero. */
  readonly serviceTimeSeconds: null | number
}

export type SuggestionReturnLeg = {
  readonly distanceMeters: null | number
  readonly durationSeconds: null | number
}

/** A volta existe e foi medida, não existe pela política, ou era esperada e ninguém a gravou. */
export type SuggestionReturnStatus = 'included' | 'not_planned' | 'unknown'

export type SuggestionDurationParts = {
  /** A estrada de ida: barracão → 1ª entrega → … → última. */
  readonly drivingSeconds: null | number
  readonly returnSeconds: null | number
  readonly returnStatus: SuggestionReturnStatus
  /** O tempo parado de **todas** as entregas, inclusive a primeira. */
  readonly serviceSeconds: number
}

export type SuggestionVehicleTrip = {
  /** ⚠️ Só a ida: é ela que alimenta o combustível da conta, e a volta não entrou nessa decisão. */
  readonly distanceMeters: null | number
  readonly durationParts: SuggestionDurationParts
  /** O tempo da viagem proposta — o único que o cartão, o detalhe e o mapa imprimem. */
  readonly durationSeconds: null | number
}

export type SuggestionVehicleValuation = {
  readonly distanceMeters: null | number
  readonly documentCount: number
  readonly driverId: null | string
  readonly durationParts: SuggestionDurationParts
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

/** ADR-0044 §5: `last_stop` fecha o dia onde está; barracão e endereço próprio pedem a volta. */
export function isReturnPlanned(endPolicy: string): boolean {
  return endPolicy !== 'last_stop'
}

/**
 * **O seam do tempo da proposta** (decisão do usuário, 2026-09-13): estrada de ida + volta ao
 * barracão (quando a política manda voltar) + tempo parado de todas as entregas. É o único número
 * que o cartão, a faixa do detalhe e a frase do mapa imprimem — uma segunda soma divergiria calada.
 *
 * ⚠️ **A primeira parada não tem perna anterior**, e a parada excluída da otimização também não —
 * `null` ali é o normal. Mas veículo em que **nenhuma** perna é conhecida tem distância e tempo
 * *desconhecidos*, não zero: zero desceria o combustível a nada e a margem apareceria melhor do que
 * é, que é o modo de falha que a ADR-0049 §2 proíbe.
 *
 * ⚠️ Volta esperada e não gravada (sugestão anterior à coluna) **não é inventada**: fica fora da
 * soma e sai como `unknown`, para a tela dizer "sem a volta ao barracão".
 */
export function sumVehicleTrip(input: {
  readonly isReturnPlanned: boolean
  readonly returnLeg: null | SuggestionReturnLeg
  readonly stops: readonly SuggestionStopRoad[]
}): SuggestionVehicleTrip {
  const { stops } = input
  const distances = stops.flatMap((stop) =>
    stop.distanceFromPreviousMeters === null ? [] : [stop.distanceFromPreviousMeters],
  )
  const durations = stops.flatMap((stop) =>
    stop.durationFromPreviousSeconds === null ? [] : [stop.durationFromPreviousSeconds],
  )
  const drivingSeconds = durations.length === 0 ? null : durations.reduce(add, 0)
  const serviceSeconds = stops.reduce((total, stop) => total + (stop.serviceTimeSeconds ?? 0), 0)
  const returnSeconds = input.isReturnPlanned ? (input.returnLeg?.durationSeconds ?? null) : null
  const returnStatus: SuggestionReturnStatus = !input.isReturnPlanned
    ? 'not_planned'
    : returnSeconds === null
      ? 'unknown'
      : 'included'

  return {
    distanceMeters: distances.length === 0 ? null : distances.reduce(add, 0),
    durationParts: { drivingSeconds, returnSeconds, returnStatus, serviceSeconds },
    durationSeconds:
      drivingSeconds === null ? null : drivingSeconds + (returnSeconds ?? 0) + serviceSeconds,
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
