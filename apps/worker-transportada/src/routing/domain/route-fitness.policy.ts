/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RouteAssignment,
  RouteDutyLimits,
  RouteProblem,
  RouteStopInput,
  RouteViolation,
} from './route-solver.types.js'

/**
 * ADR-0044 §4: as violações entram como **penalidade**, não como corte rígido. Matar o indivíduo
 * inviável empobrece a população — e numa instância em que nenhuma solução cabe, cortar deixaria o
 * solver sem nada a devolver, quando o que o conferente precisa é da melhor rota com a violação
 * nomeada.
 *
 * Os pesos são grandes o bastante para que violar nunca compense economicamente, e diferentes entre
 * si para que o solver prefira estourar a janela em minutos a estourar o peso em toneladas.
 */
const WEIGHT_PENALTY_MICROS_PER_KILOGRAM = 10_000_000
const WINDOW_PENALTY_MICROS_PER_SECOND = 100_000
const DUTY_PENALTY_MICROS_PER_SECOND = 200_000
/** Par inalcançável não é rota cara: é rota que não existe, e tem de perder de qualquer alternativa. */
const UNREACHABLE_PENALTY_MICROS = 1_000_000_000_000

export type EvaluatedRoute = Readonly<{
  assignment: RouteAssignment
  violations: readonly RouteViolation[]
  penaltyMicros: number
}>

/**
 * Percorre uma sequência de paradas de um veículo e apura o que ela custa **em dinheiro** — nunca em
 * quilômetro (ADR-0044 §4). Roteirizar por km em frota mista otimiza a coisa errada: o caminhão que
 * bebe o dobro deve andar menos, e é o custo por metro de cada um que diz isso.
 */
export function evaluateRoute(input: {
  readonly problem: RouteProblem
  readonly stopIndexes: readonly number[]
  readonly vehicleIndex: number
}): EvaluatedRoute {
  const vehicle = input.problem.vehicles[input.vehicleIndex]
  if (vehicle === undefined) throw new Error('vehicleIndex out of range')

  const stopsByIndex = new Map(input.problem.stops.map((stop) => [stop.index, stop]))
  const violations: RouteViolation[] = []

  let distanceMeters = 0
  let durationSeconds = 0
  let drivingSeconds = 0
  let loadKilograms = 0
  let penaltyMicros = 0
  let previous = input.problem.depotIndex
  let sinceBreakSeconds = 0

  for (const stopIndex of input.stopIndexes) {
    const leg = readLeg(input.problem, previous, stopIndex)
    if (leg === null) {
      penaltyMicros += UNREACHABLE_PENALTY_MICROS
      violations.push({ amount: 1, kind: 'unreachable', stopIndex, vehicleId: vehicle.id })
      previous = stopIndex
      continue
    }

    distanceMeters += leg.distanceMeters
    durationSeconds += leg.durationSeconds
    drivingSeconds += leg.durationSeconds
    sinceBreakSeconds += leg.durationSeconds

    const duty = input.problem.duty
    if (duty !== null) {
      const inserted = insertBreakIfDue({ duty, sinceBreakSeconds })
      durationSeconds += inserted.breakSeconds
      sinceBreakSeconds = inserted.sinceBreakSeconds
    }

    const stop = stopsByIndex.get(stopIndex)
    if (stop === undefined) {
      previous = stopIndex
      continue
    }

    loadKilograms += stop.weightKilograms

    const lateness = latenessSeconds(stop, durationSeconds)
    if (lateness > 0) {
      penaltyMicros += lateness * WINDOW_PENALTY_MICROS_PER_SECOND
      violations.push({
        amount: lateness,
        kind: 'delivery_window',
        stopIndex,
        vehicleId: vehicle.id,
      })
    }

    /**
     * Chegar antes da janela abrir não é violação: é espera. O relógio anda até a abertura, e é isso
     * que faz o ETA da parada seguinte ser honesto em vez de otimista.
     */
    durationSeconds = Math.max(durationSeconds, stop.windowStartSeconds ?? durationSeconds)
    durationSeconds += stop.serviceTimeSeconds
    previous = stopIndex
  }

  const returnLeg = readReturnLeg(input.problem, previous)
  if (returnLeg !== null) {
    distanceMeters += returnLeg.distanceMeters
    durationSeconds += returnLeg.durationSeconds
    drivingSeconds += returnLeg.durationSeconds
  }

  const overweight = loadKilograms - vehicle.capacityKilograms
  if (overweight > 0) {
    penaltyMicros += overweight * WEIGHT_PENALTY_MICROS_PER_KILOGRAM
    violations.push({ amount: overweight, kind: 'weight', stopIndex: null, vehicleId: vehicle.id })
  }

  const dutyViolation = evaluateDuty({
    drivingSeconds,
    duty: input.problem.duty,
    dutySeconds: durationSeconds,
  })
  if (dutyViolation > 0) {
    penaltyMicros += dutyViolation * DUTY_PENALTY_MICROS_PER_SECOND
    violations.push({
      amount: dutyViolation,
      kind: 'duty_time',
      stopIndex: null,
      vehicleId: vehicle.id,
    })
  }

  const costMicros = distanceMeters * vehicle.costPerMeterMicros

  return {
    assignment: {
      costMicros,
      distanceMeters,
      durationSeconds,
      stopIndexes: input.stopIndexes,
      vehicleId: vehicle.id,
    },
    penaltyMicros,
    violations,
  }
}

/** O que o algoritmo minimiza: dinheiro mais penalidade, na mesma unidade. */
export function routeFitness(evaluated: EvaluatedRoute): number {
  return evaluated.assignment.costMicros + evaluated.penaltyMicros
}

function readLeg(
  problem: RouteProblem,
  from: number,
  to: number,
): { readonly distanceMeters: number; readonly durationSeconds: number } | null {
  const durationSeconds = problem.durationsSeconds[from]?.[to]
  const distanceMeters = problem.distancesMeters[from]?.[to]
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    distanceMeters === null ||
    distanceMeters === undefined
  ) {
    return null
  }

  return { distanceMeters, durationSeconds }
}

/**
 * ADR-0044 §5: `endIndex` nulo é "termina na última parada" — o motorista fecha o dia onde está, e
 * não há trecho de volta a somar.
 */
function readReturnLeg(
  problem: RouteProblem,
  from: number,
): { readonly distanceMeters: number; readonly durationSeconds: number } | null {
  if (problem.endIndex === null) return null

  return readLeg(problem, from, problem.endIndex)
}

/** Atraso, não adiantamento: chegar cedo é esperar, chegar tarde é a violação que aparece na tela. */
function latenessSeconds(stop: RouteStopInput, arrivalSeconds: number): number {
  if (stop.windowEndSeconds === null) return 0

  return Math.max(0, arrivalSeconds - stop.windowEndSeconds)
}

function insertBreakIfDue(input: {
  readonly duty: RouteDutyLimits
  readonly sinceBreakSeconds: number
}): { readonly breakSeconds: number; readonly sinceBreakSeconds: number } {
  const { breakEverySeconds, mandatoryBreakSeconds } = input.duty
  if (breakEverySeconds === null || mandatoryBreakSeconds === null) {
    return { breakSeconds: 0, sinceBreakSeconds: input.sinceBreakSeconds }
  }
  if (input.sinceBreakSeconds < breakEverySeconds) {
    return { breakSeconds: 0, sinceBreakSeconds: input.sinceBreakSeconds }
  }

  return { breakSeconds: mandatoryBreakSeconds, sinceBreakSeconds: 0 }
}

/** Zero quando a jornada está desligada — que é o padrão, e é o que "nulo é não-restrição" quer dizer. */
function evaluateDuty(input: {
  readonly drivingSeconds: number
  readonly duty: RouteDutyLimits | null
  readonly dutySeconds: number
}): number {
  if (input.duty === null) return 0

  const overDriving =
    input.duty.maxDrivingSeconds === null
      ? 0
      : Math.max(0, input.drivingSeconds - input.duty.maxDrivingSeconds)
  const overDuty =
    input.duty.maxDutySeconds === null
      ? 0
      : Math.max(0, input.dutySeconds - input.duty.maxDutySeconds)

  return overDriving + overDuty
}
