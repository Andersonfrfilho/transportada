/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RouteProblem,
  RouteSolution,
  RouteStopInput,
  RouteVehicleInput,
} from '../domain/route-solver.types.js'

/**
 * O que o worker precisa carregar para montar o problema. Tudo por referência, a partir do
 * `suggestionId` que chegou na fila — a fila carrega identificador, nunca endereço (`security.md` §6).
 */
export type RouteOptimizationContext = Readonly<{
  companyId: string
  /** Segundos a partir do início da jornada; a janela da parada é relativa a ele. */
  dayStartEpochSeconds: number
  depot: RouteOptimizationPoint | null
  duty: RouteProblem['duty']
  end: RouteOptimizationPoint | null
  seed: number
  solverTimeBudgetSeconds: number
  stops: readonly RouteOptimizationStop[]
  vehicles: readonly RouteVehicleInput[]
}>

export type RouteOptimizationPoint = Readonly<{
  addressKey: string
  latitude: string
  longitude: string
}>

export type RouteOptimizationStop = RouteOptimizationPoint &
  Readonly<{
    /**
     * Spec 058 P2: as notas que caem nesta parada. Vazio na sugestão de viagem — lá a nota já está
     * vinculada, e a parada tem `stopId`. Aqui é o contrário: parada proposta, sem viagem ainda.
     */
    documentIds: readonly string[]
    /** ADR-0044 §5: `city` não entra na otimização — vai marcada, no fim, esperando o humano. */
    excludedFromOptimization: boolean
    label: string
    serviceTimeSeconds: number
    /** Nulo na multi-veículo: a parada ainda não existe, e é o aceite que a cria. */
    stopId: string | null
    weightEstimated: boolean
    weightKilograms: number
    windowEndSeconds: number | null
    windowStartSeconds: number | null
  }>

export type RouteOptimizationPorts = Readonly<{
  matrix: {
    table: (
      coordinates: readonly { readonly latitude: string; readonly longitude: string }[],
    ) => Promise<{
      readonly distancesMeters: readonly (readonly (number | null)[])[]
      readonly durationsSeconds: readonly (readonly (number | null)[])[]
    }>
  }
  solve: (problem: RouteProblem) => RouteSolution
}>

export type RouteOptimizationOutcome = Readonly<{
  estimatedCostAmount: string
  estimatedDistanceMeters: number
  estimatedDurationSeconds: number
  orderedStops: readonly OptimizedStop[]
  solverMetrics: Readonly<{ generations: number }>
  truncated: boolean
}>

export type OptimizedStop = Readonly<{
  addressKey: string
  distanceFromPreviousMeters: number | null
  durationFromPreviousSeconds: number | null
  documentIds: readonly string[]
  estimatedArrivalAt: Date | null
  excludedFromOptimization: boolean
  label: string
  sequence: number
  serviceTimeSeconds: number
  stopId: string | null
  /** Qual veículo serve a parada — nulo quando a sugestão é de uma viagem só, ou quando ela ficou de fora. */
  vehicleId: string | null
  violations: RouteSolution['violations']
  weightEstimated: boolean
}>

const MICROS_PER_UNIT = 1_000_000
const MONEY_SCALE = 4
const MILLISECONDS_PER_SECOND = 1_000

/**
 * Monta o problema, roda o solver e devolve a sequência com os trechos apurados. **Não toca no
 * banco e não fala com fila**: é isso que torna esta função testável contra um cenário inteiro sem
 * broker nem Postgres, e é o mesmo motivo pelo qual o solver é puro (RF-10).
 *
 * A queda da matriz **não** é tratada aqui: ela sobe como está, e quem a converte em sugestão
 * `failed` com código estável é o handler. Engolir aqui e devolver rota por linha reta é exatamente
 * o que a ADR-0044 §1 proíbe.
 */
export async function runRouteOptimization(input: {
  readonly context: RouteOptimizationContext
  readonly ports: RouteOptimizationPorts
}): Promise<RouteOptimizationOutcome> {
  const { context, ports } = input

  /**
   * A parada de precisão grosseira sai do problema antes da matriz: pedi-la ao OSRM gastaria uma
   * coordenada que é palpite de quilômetros, e a entrada dela na conta contaminaria o custo que o
   * conferente vê.
   */
  const optimizable = context.stops.filter((stop) => !stop.excludedFromOptimization)
  const excluded = context.stops.filter((stop) => stop.excludedFromOptimization)

  if (optimizable.length === 0) {
    return {
      estimatedCostAmount: '0.0000',
      estimatedDistanceMeters: 0,
      estimatedDurationSeconds: 0,
      orderedStops: excluded.map((stop, offset) => toExcludedStop({ offset, stop })),
      solverMetrics: { generations: 0 },
      truncated: false,
    }
  }

  const depot = context.depot ?? optimizable[0]
  if (depot === undefined) throw new Error('route optimization needs an origin')

  /** Índice 0 é a partida; as paradas são 1..n. O fim, quando é outro lugar, é o último índice. */
  const points = [depot, ...optimizable, ...(context.end === null ? [] : [context.end])]
  const matrix = await ports.matrix.table(points)

  const problem: RouteProblem = {
    depotIndex: 0,
    distancesMeters: matrix.distancesMeters,
    durationsSeconds: matrix.durationsSeconds,
    duty: context.duty,
    endIndex: context.end === null ? null : points.length - 1,
    seed: context.seed,
    stagnationLimit: 40,
    stops: optimizable.map(
      (stop, offset): RouteStopInput => ({
        index: offset + 1,
        serviceTimeSeconds: stop.serviceTimeSeconds,
        weightKilograms: stop.weightKilograms,
        windowEndSeconds: stop.windowEndSeconds,
        windowStartSeconds: stop.windowStartSeconds,
      }),
    ),
    timeBudgetMilliseconds: context.solverTimeBudgetSeconds * MILLISECONDS_PER_SECOND,
    vehicles: context.vehicles,
  }

  const solution = ports.solve(problem)

  return {
    estimatedCostAmount: toMoney(solution.totalCostMicros),
    estimatedDistanceMeters: solution.totalDistanceMeters,
    estimatedDurationSeconds: solution.totalDurationSeconds,
    orderedStops: [
      ...toOrderedStops({
        context,
        distancesMeters: matrix.distancesMeters,
        durationsSeconds: matrix.durationsSeconds,
        optimizable,
        solution,
      }),
      ...excluded.map((stop, offset) =>
        toExcludedStop({ offset: countAssigned(solution) + offset, stop }),
      ),
    ],
    solverMetrics: { generations: solution.generations },
    truncated: solution.truncated,
  }
}

function countAssigned(solution: RouteSolution): number {
  return solution.assignments.reduce(
    (total, assignment) => total + assignment.stopIndexes.length,
    0,
  )
}

function toOrderedStops(input: {
  readonly context: RouteOptimizationContext
  readonly distancesMeters: readonly (readonly (number | null)[])[]
  readonly durationsSeconds: readonly (readonly (number | null)[])[]
  readonly optimizable: readonly RouteOptimizationStop[]
  readonly solution: RouteSolution
}): readonly OptimizedStop[] {
  const violationsByStopIndex = new Map<number, RouteSolution['violations'][number][]>()
  for (const violation of input.solution.violations) {
    if (violation.stopIndex === null) continue
    const current = violationsByStopIndex.get(violation.stopIndex) ?? []
    current.push(violation)
    violationsByStopIndex.set(violation.stopIndex, current)
  }

  const ordered: OptimizedStop[] = []
  let sequence = 0
  let clockSeconds = input.context.dayStartEpochSeconds

  for (const assignment of input.solution.assignments) {
    /**
     * O veículo vem da própria atribuição. A ordem da lista de veículos do contexto é a gravada em
     * `route_suggestion_vehicles`, e é ela que faz a mesma semente distribuir as mesmas paradas para
     * os mesmos veículos — sem ordem estável, o determinismo prometido no RNF cairia.
     */
    const vehicleId = assignment.vehicleId
    /** Cada veículo recomeça no depósito: o trecho da primeira parada é medido a partir de 0. */
    let previousIndex = 0
    for (const stopIndex of assignment.stopIndexes) {
      const stop = input.optimizable[stopIndex - 1]
      if (stop === undefined) continue

      const durationFromPreviousSeconds = readLeg(input.durationsSeconds, previousIndex, stopIndex)
      const distanceFromPreviousMeters = readLeg(input.distancesMeters, previousIndex, stopIndex)
      sequence += 1
      clockSeconds += durationFromPreviousSeconds ?? 0

      /**
       * ⚠️ **Chegar antes da janela abrir é espera, e a ETA precisa dizer isso.** O fitness já
       * esperava (`route-fitness.policy.ts`: `durationSeconds = max(duration, windowStart)`), mas a
       * hora publicada ao operador vinha sem a espera — o custo escolhia a rota contando o tempo
       * parado no portão e a tela mostrava chegada às 5h da manhã. As duas contas passam a ser a
       * mesma; foi o teste de integração do pool que achou a divergência.
       */
      if (stop.windowStartSeconds !== null) {
        clockSeconds = Math.max(
          clockSeconds,
          input.context.dayStartEpochSeconds + stop.windowStartSeconds,
        )
      }

      ordered.push({
        addressKey: stop.addressKey,
        distanceFromPreviousMeters,
        durationFromPreviousSeconds,
        estimatedArrivalAt: new Date(clockSeconds * MILLISECONDS_PER_SECOND),
        excludedFromOptimization: false,
        label: stop.label,
        sequence,
        serviceTimeSeconds: stop.serviceTimeSeconds,
        documentIds: stop.documentIds,
        stopId: stop.stopId,
        vehicleId,
        violations: violationsByStopIndex.get(stopIndex) ?? [],
        weightEstimated: stop.weightEstimated,
      })

      clockSeconds += stop.serviceTimeSeconds
      previousIndex = stopIndex
    }
  }

  return ordered
}

/** `null` quando o par é inalcançável — e a violação já foi registrada pelo solver. */
function readLeg(
  matrix: readonly (readonly (number | null)[])[],
  from: number,
  to: number,
): number | null {
  return matrix[from]?.[to] ?? null
}

function toExcludedStop(input: {
  readonly offset: number
  readonly stop: RouteOptimizationStop
}): OptimizedStop {
  return {
    addressKey: input.stop.addressKey,
    distanceFromPreviousMeters: null,
    durationFromPreviousSeconds: null,
    /** Sem ETA: ela não entrou na conta, e um horário aqui seria número inventado. */
    estimatedArrivalAt: null,
    excludedFromOptimization: true,
    label: input.stop.label,
    sequence: input.offset + 1,
    documentIds: input.stop.documentIds,
    serviceTimeSeconds: input.stop.serviceTimeSeconds,
    stopId: input.stop.stopId,
    /** Fora da otimização é fora da distribuição: quem decide o veículo dela é gente. */
    vehicleId: null,
    violations: [],
    weightEstimated: input.stop.weightEstimated,
  }
}

function toMoney(micros: number): string {
  return (micros / MICROS_PER_UNIT).toFixed(MONEY_SCALE)
}
