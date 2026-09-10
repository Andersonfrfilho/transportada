/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveServableStops, type DriverCoverageEntry } from '../domain/servable-stops.policy.js'
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
  /**
   * Spec 109: **o instante em que a frota sai**, e a origem do relógio do solver — a janela da
   * parada é relativa a ele.
   *
   * ⚠️ Era a meia-noite **UTC**, que em Brasília são 21h do dia anterior: toda rota partia à noite e
   * as chegadas caíam de madrugada (medido em 2026-09-09: cinco viagens terminando entre 03:04 e
   * 07:03). A hora de saída é cadastro (`company_route_optimization_settings.departure_time_seconds`),
   * porque a operação que sai às 5h existe e não é a mesma que sai às 8h.
   */
  departureEpochSeconds: number
  depot: RouteOptimizationPoint | null
  duty: RouteProblem['duty']
  /**
   * Spec 106: o cadastro de cobertura por motorista. **Motorista ausente do mapa serve tudo** — a
   * regra de fallback: quem não declarou não restringiu.
   */
  driverCoverage?: ReadonlyMap<string, readonly DriverCoverageEntry[]> | undefined
  /** Cidade dobrada + UF → código da zona, de `freight_region_cities`. */
  regionCodeByCityKey?: ReadonlyMap<string, string> | undefined
  /** Spec 104 D3: `null` desliga; hoje nenhuma origem o preenche (ver o comentário no uso). */
  maxStopsPerRoute?: number | null
  end: RouteOptimizationPoint | null
  seed: number
  solverTimeBudgetSeconds: number
  stops: readonly RouteOptimizationStop[]
  /**
   * Spec 106: o veículo do contexto carrega **quem dirige**, que o do solver não precisa conhecer —
   * a cobertura é resolvida aqui e chega ao solver já como conjunto de índices.
   */
  vehicles: readonly (RouteVehicleInput & Readonly<{ driverId?: string | null }>)[]
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
    /** Spec 106: a cidade e a UF da parada, que é como a cobertura do motorista casa com ela. */
    city: string
    documentIds: readonly string[]
    /** ADR-0044 §5: `city` não entra na otimização — vai marcada, no fim, esperando o humano. */
    excludedFromOptimization: boolean
    label: string
    serviceTimeSeconds: number
    /** Nulo na multi-veículo: a parada ainda não existe, e é o aceite que a cria. */
    stopId: string | null
    state: string
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
  /**
   * Spec 109 D2: **a saída sob a qual este roteiro foi proposto.** Ela viaja com a sugestão porque é
   * a premissa que o operador aceitou — e é dela que o despacho mede o atraso para reancorar o ETA.
   */
  plannedDepartureAt: Date
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
  /**
   * Por que a parada ficou **sem veículo**. Nulo é parada distribuída.
   *
   * ⚠️ As três causas pedem ações diferentes — cadastrar o endereço, cadastrar cobertura, ou mandar
   * outro caminhão. Sem a razão viajando, a tela derivava "sem motorista que cubra a região" para
   * qualquer sobra, e mandaria o operador cadastrar cobertura para resolver tonelagem.
   */
  leftoverReason: 'imprecise_location' | 'not_covered' | 'over_capacity' | null
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
      plannedDepartureAt: toDepartureDate(context),
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
    /**
     * Spec 104 D3: teto **operacional** de paradas numa rota. `null` até a empresa poder declará-lo
     * — acrescentá-lo como padrão silencioso mudaria o roteiro de toda instalação sem ninguém pedir,
     * e um número escolhido aqui seria palpite com aparência de regra.
     */
    maxStopsPerRoute: context.maxStopsPerRoute ?? null,
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
    /**
     * Spec 106: **a costura.** O índice da parada só existe aqui — o repositório lê o cadastro, e é
     * este ponto que sabe qual parada virou qual índice na matriz.
     *
     * ⚠️ `index: offset + 1` porque `points[0]` é o depósito, a mesma conta de `stops` acima. Errar
     * o deslocamento aqui restringiria o veículo à parada errada, calado.
     */
    vehicles: context.vehicles.map((vehicle) => ({
      ...vehicle,
      servableStopIndexes: resolveServableStops({
        coverage: context.driverCoverage?.get(vehicle.driverId ?? '') ?? [],
        regionCodeByCityKey: context.regionCodeByCityKey ?? new Map(),
        stops: optimizable.map((stop, offset) => ({
          city: stop.city,
          index: offset + 1,
          state: stop.state,
        })),
      }),
    })),
  }

  const solution = ports.solve(problem)

  return {
    estimatedCostAmount: toMoney(solution.totalCostMicros),
    estimatedDistanceMeters: solution.totalDistanceMeters,
    plannedDepartureAt: toDepartureDate(context),
    estimatedDurationSeconds: solution.totalDurationSeconds,
    orderedStops: [
      ...toOrderedStops({
        context,
        distancesMeters: matrix.distancesMeters,
        durationsSeconds: matrix.durationsSeconds,
        optimizable,
        solution,
      }),
      /**
       * ⚠️ **A parada que o solver não distribuiu precisa ser gravada, ou a carga some da tela.**
       * `toOrderedStops` percorre as rotas; sem esta linha, a nota aparada por capacidade não
       * viraria nem viagem nem sobra — desapareceria do maço em silêncio, que é o modo de falha que
       * a spec 107 existe para impedir.
       */
      ...toLeftoverStops({
        offset: countAssigned(solution),
        optimizable,
        solution,
      }),
      ...excluded.map((stop, offset) =>
        toExcludedStop({
          offset: countAssigned(solution) + solution.unassignedStopIndexes.length + offset,
          stop,
        }),
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
  let clockSeconds = input.context.departureEpochSeconds

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
          input.context.departureEpochSeconds + stop.windowStartSeconds,
        )
      }

      ordered.push({
        addressKey: stop.addressKey,
        distanceFromPreviousMeters,
        durationFromPreviousSeconds,
        estimatedArrivalAt: new Date(clockSeconds * MILLISECONDS_PER_SECOND),
        /** Parada distribuída não é sobra: a razão é nula porque ela **tem** veículo. */
        leftoverReason: null,
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

/** Spec 109 D2: a saída suposta, como instante — a mesma origem que o relógio do solver usou. */
function toDepartureDate(context: RouteOptimizationContext): Date {
  return new Date(context.departureEpochSeconds * MILLISECONDS_PER_SECOND)
}

/** `null` quando o par é inalcançável — e a violação já foi registrada pelo solver. */
function readLeg(
  matrix: readonly (readonly (number | null)[])[],
  from: number,
  to: number,
): number | null {
  return matrix[from]?.[to] ?? null
}

/**
 * As paradas que o solver deixou sem veículo — hoje, a carga que passou do teto do caminhão e ficou
 * para a próxima viagem (`capacity-trim.ts`).
 *
 * ⚠️ Elas entram **depois** das distribuídas e **antes** das excluídas por endereço, e a `sequence`
 * é contínua porque ela é a chave que casa a parada com as notas dela na gravação.
 */
function toLeftoverStops(input: {
  readonly offset: number
  readonly optimizable: readonly RouteOptimizationStop[]
  readonly solution: RouteSolution
}): readonly OptimizedStop[] {
  return input.solution.unassignedStopIndexes.flatMap((stopIndex, offset) => {
    /** `index: offset + 1` na montagem do problema: o depósito é o zero, e aqui se desfaz a conta. */
    const stop = input.optimizable[stopIndex - 1]
    if (stop === undefined) return []

    return [
      {
        addressKey: stop.addressKey,
        distanceFromPreviousMeters: null,
        documentIds: stop.documentIds,
        durationFromPreviousSeconds: null,
        /** Sem ETA: ela não entrou na conta, e um horário aqui seria número inventado. */
        estimatedArrivalAt: null,
        /** Ela **entrou** na otimização; o que a tirou foi o teto do caminhão, não o endereço. */
        excludedFromOptimization: false,
        label: stop.label,
        leftoverReason: 'over_capacity' as const,
        sequence: input.offset + offset + 1,
        serviceTimeSeconds: stop.serviceTimeSeconds,
        stopId: stop.stopId,
        vehicleId: null,
        violations: [],
        weightEstimated: stop.weightEstimated,
      },
    ]
  })
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
    /** ADR-0044 §5: coordenada em precisão de município sai antes da matriz, e a razão é essa. */
    leftoverReason: 'imprecise_location' as const,
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
