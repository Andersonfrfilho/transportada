/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { canServe, partitionByCoverage, repairCoverage } from './coverage.js'
import { buildNeighbourhood, type RouteNeighbourhood } from './neighbourhood.js'
import {
  buildNearestNeighbourRoute,
  createSeededRandom,
  improveWithTwoOpt,
} from './local-search.js'
import { evaluateRoute, routeFitness } from './route-fitness.policy.js'
import type {
  OptimizationQuality,
  RouteAssignment,
  RouteProblem,
  RouteSolution,
  RouteViolation,
} from './route-solver.types.js'

const POPULATION_SIZE = 40
const TOURNAMENT_SIZE = 4
const ELITE_COUNT = 2
const MUTATION_RATE = 0.2

/**
 * Cromossomo: uma permutação das paradas com **separadores de veículo**. `[3, 1, -1, 2]` com dois
 * veículos é "veículo A faz 3 e 1; veículo B faz 2". É o que permite ao mesmo operador genético
 * mexer em ordem e em distribuição — reordenar o cromossomo pode mover uma parada de um veículo
 * para outro, e é assim que o GA resolve os dois eixos do CVRP de uma vez.
 */
type Chromosome = readonly number[]

const SEPARATOR = -1

/**
 * Spec 106: largar uma parada que alguém cobre custa como um par inalcançável. Não é ajuste fino —
 * é a diferença entre "rota cara" e "carga que não sai do barracão".
 */
const DROPPED_STOP_PENALTY_MICROS = 1_000_000_000_000

/**
 * O solver da ADR-0044 §4: GA **memético** — todo indivíduo passa por `2-opt` antes de entrar na
 * população, e é essa hibridização que separa resultado publicável de brinquedo.
 *
 * Puro, sem I/O (RF-10). Determinístico para uma dada semente (ADR-0044 §8). Para por orçamento de
 * tempo ou por estagnação, o que vier primeiro — nunca roda para sempre.
 */
export function solveRoute(problem: RouteProblem, now: () => number = Date.now): RouteSolution {
  const deadline = now() + problem.timeBudgetMilliseconds
  const stopIndexes = problem.stops.map((stop) => stop.index)

  // Uma parada só (ou nenhuma) não tem o que otimizar: devolve a trivial sem gastar orçamento
  if (stopIndexes.length <= 1) {
    return buildSolution({ chromosome: stopIndexes, generations: 0, problem, truncated: false })
  }

  /**
   * Spec 106 D1: **a parada que ninguém cobre nunca entra no cromossomo.** Mantê-la lá obrigaria
   * cada indivíduo a carregá-la sem destino, e os operadores genéticos a passeariam entre veículos
   * que não podem servi-la. Ela sai daqui direto para a sobra, que é o que a ADR-0044 §5 promete.
   */
  const coverage = partitionByCoverage(problem)
  if (coverage.servable.length === 0) {
    return buildSolution({ chromosome: [], generations: 0, problem, truncated: false })
  }

  const random = createSeededRandom(problem.seed)
  /** D1: o mesmo relógio que corta o laço de gerações corta o 2-opt lá dentro. */
  const shouldStop = (): boolean => now() >= deadline
  /**
   * Spec 105: construída **uma vez** — com 40 indivíduos por geração, montá-la no laço custaria
   * mais que o 2-opt que ela veio acelerar.
   */
  const neighbourhood = buildNeighbourhood({ problem, stopIndexes: coverage.servable })
  let population = buildInitialPopulation({
    neighbourhood,
    problem,
    random,
    shouldStop,
    stopIndexes: coverage.servable,
  })
  let best = population[0] ?? coverage.servable
  let bestFitness = totalFitness(problem, best)
  let generations = 0
  let stagnant = 0

  while (stagnant < problem.stagnationLimit && now() < deadline) {
    population = evolve({ neighbourhood, population, problem, random, shouldStop })
    generations += 1

    const challenger = population[0]
    if (challenger === undefined) break

    const challengerFitness = totalFitness(problem, challenger)
    if (challengerFitness < bestFitness) {
      best = challenger
      bestFitness = challengerFitness
      stagnant = 0
    } else {
      stagnant += 1
    }
  }

  /**
   * Truncado é quando o relógio cortou antes da estagnação: a resposta é o melhor encontrado, e ela
   * vai **marcada** — uma sugestão cortada que não diz que foi cortada convida a confiar demais nela.
   */
  return buildSolution({
    chromosome: best,
    generations,
    problem,
    truncated: now() >= deadline && stagnant < problem.stagnationLimit,
  })
}

/**
 * A população nasce com o vizinho-mais-próximo dentro dela. Não é conveniência: é o piso. Um GA que
 * parte só de permutações aleatórias pode terminar pior que o guloso, e o baseline da ADR-0044 §4
 * existe justamente para pegar isso — começar acima dele é como não perder.
 */
function buildInitialPopulation(input: {
  readonly neighbourhood: RouteNeighbourhood
  readonly shouldStop: () => boolean
  readonly problem: RouteProblem
  readonly random: () => number
  readonly stopIndexes: readonly number[]
}): readonly Chromosome[] {
  const greedy = splitAcrossVehicles({
    problem: input.problem,
    stopIndexes: buildNearestNeighbourRoute({
      problem: input.problem,
      stopIndexes: input.stopIndexes,
    }),
  })

  const population: Chromosome[] = [
    refine(input.problem, greedy, input.shouldStop, input.neighbourhood),
  ]
  while (population.length < POPULATION_SIZE) {
    const shuffled = shuffle(input.stopIndexes, input.random)
    population.push(
      refine(
        input.problem,
        splitAcrossVehicles({ problem: input.problem, stopIndexes: shuffled }),
        input.shouldStop,
        input.neighbourhood,
      ),
    )
  }

  return sortByFitness(input.problem, population)
}

function evolve(input: {
  readonly neighbourhood: RouteNeighbourhood
  readonly shouldStop: () => boolean
  readonly population: readonly Chromosome[]
  readonly problem: RouteProblem
  readonly random: () => number
}): readonly Chromosome[] {
  // Elitismo: o melhor não se perde por azar de sorteio
  const next: Chromosome[] = input.population.slice(0, ELITE_COUNT).map((one) => [...one])

  while (next.length < POPULATION_SIZE) {
    const parentA = selectByTournament(input)
    const parentB = selectByTournament(input)
    const child = orderCrossover({ parentA, parentB, random: input.random })
    const mutated = input.random() < MUTATION_RATE ? swapMutate(child, input.random) : child
    next.push(refine(input.problem, mutated, input.shouldStop, input.neighbourhood))
  }

  return sortByFitness(input.problem, next)
}

function selectByTournament(input: {
  readonly population: readonly Chromosome[]
  readonly problem: RouteProblem
  readonly random: () => number
}): Chromosome {
  let best = input.population[0] ?? []
  let bestFitness = Number.POSITIVE_INFINITY

  for (let round = 0; round < TOURNAMENT_SIZE; round += 1) {
    const candidate = input.population[Math.floor(input.random() * input.population.length)]
    if (candidate === undefined) continue

    const candidateFitness = totalFitness(input.problem, candidate)
    if (candidateFitness < bestFitness) {
      best = candidate
      bestFitness = candidateFitness
    }
  }

  return best
}

/**
 * Crossover de ordem (OX): preserva um trecho contíguo do pai A e completa com a ordem relativa do
 * pai B. É o operador certo para permutação — um crossover de ponto único produziria cromossomo com
 * parada repetida e parada faltando, que não é rota nenhuma.
 */
function orderCrossover(input: {
  readonly parentA: Chromosome
  readonly parentB: Chromosome
  readonly random: () => number
}): Chromosome {
  const length = input.parentA.length
  if (length < 2) return [...input.parentA]

  const first = Math.floor(input.random() * length)
  const second = Math.floor(input.random() * length)
  const start = Math.min(first, second)
  const end = Math.max(first, second)

  const child: (number | undefined)[] = Array.from({ length }, () => undefined)
  const taken = new Set<number>()

  for (let position = start; position <= end; position += 1) {
    const gene = input.parentA[position]
    if (gene === undefined) continue
    child[position] = gene
    if (gene !== SEPARATOR) taken.add(gene)
  }

  let cursor = 0
  for (const gene of input.parentB) {
    if (gene !== SEPARATOR && taken.has(gene)) continue
    while (cursor < length && child[cursor] !== undefined) cursor += 1
    if (cursor >= length) break
    child[cursor] = gene
    if (gene !== SEPARATOR) taken.add(gene)
  }

  return child.filter((gene): gene is number => gene !== undefined)
}

function swapMutate(chromosome: Chromosome, random: () => number): Chromosome {
  if (chromosome.length < 2) return chromosome

  const mutated = [...chromosome]
  const first = Math.floor(random() * mutated.length)
  const second = Math.floor(random() * mutated.length)
  const held = mutated[first]
  const other = mutated[second]
  if (held === undefined || other === undefined) return mutated

  mutated[first] = other
  mutated[second] = held
  return mutated
}

/** A hibridização: cada rota do cromossomo é polida por `2-opt` antes de o indivíduo ser avaliado. */
function refine(
  problem: RouteProblem,
  chromosome: Chromosome,
  shouldStop: () => boolean = () => false,
  neighbourhood?: RouteNeighbourhood,
): Chromosome {
  /**
   * ⚠️ O reparo vem **antes** da busca local: 2-opt sobre uma rota que ainda tem parada proibida
   * otimizaria a ordem de algo que vai mudar de veículo logo em seguida.
   */
  const routes = repairCoverage({
    problem,
    routes: splitChromosome(chromosome, problem.vehicles.length),
  })
  const refined = routes.map((stopIndexes, vehicleIndex) =>
    improveWithTwoOpt({ neighbourhood, problem, shouldStop, stopIndexes, vehicleIndex }),
  )

  return joinChromosome(refined)
}

/**
 * Spec 104 D2: **zero geração é a semente gulosa, não uma solução.** Medido: acima de 200 paradas o
 * GA não completa uma geração no orçamento padrão, e o que sai é o vizinho-mais-próximo com 2-opt
 * parcial — apresentado, até esta spec, como sugestão otimizada.
 *
 * ⚠️ A instância trivial (0 ou 1 parada) sai `optimized`, e está certo: não há o que otimizar, e
 * chamar de gulosa uma resposta exata seria o erro simétrico.
 */
function resolveOptimizationQuality(input: {
  readonly generations: number
  readonly problem: RouteProblem
  readonly truncated: boolean
}): OptimizationQuality {
  if (input.problem.stops.length <= 1) return 'optimized'
  if (input.generations === 0) return 'greedy'

  return input.truncated ? 'partial' : 'optimized'
}

function splitAcrossVehicles(input: {
  readonly problem: RouteProblem
  readonly stopIndexes: readonly number[]
}): Chromosome {
  const vehicleCount = Math.max(1, input.problem.vehicles.length)
  if (vehicleCount === 1) return [...input.stopIndexes]

  /**
   * Corte por capacidade acumulada, não por contagem: fatiar em partes iguais colocaria a mesma
   * tonelada no caminhão de 3t e no de 30t, e o solver gastaria gerações desfazendo isso.
   */
  const weightByIndex = new Map(
    input.problem.stops.map((stop) => [stop.index, stop.weightKilograms]),
  )
  const chromosome: number[] = []
  let vehicleIndex = 0
  let load = 0

  for (const stopIndex of input.stopIndexes) {
    const capacity = input.problem.vehicles[vehicleIndex]?.capacityKilograms ?? 0
    const weight = weightByIndex.get(stopIndex) ?? 0

    if (load + weight > capacity && vehicleIndex < vehicleCount - 1) {
      chromosome.push(SEPARATOR)
      vehicleIndex += 1
      load = 0
    }

    chromosome.push(stopIndex)
    load += weight
  }

  return chromosome
}

function splitChromosome(
  chromosome: Chromosome,
  vehicleCount: number,
): readonly (readonly number[])[] {
  const routes: number[][] = Array.from({ length: Math.max(1, vehicleCount) }, () => [])
  let vehicleIndex = 0

  for (const gene of chromosome) {
    if (gene === SEPARATOR) {
      vehicleIndex = Math.min(vehicleIndex + 1, routes.length - 1)
      continue
    }
    routes[vehicleIndex]?.push(gene)
  }

  return routes
}

function joinChromosome(routes: readonly (readonly number[])[]): Chromosome {
  const chromosome: number[] = []
  routes.forEach((route, index) => {
    if (index > 0) chromosome.push(SEPARATOR)
    chromosome.push(...route)
  })

  return chromosome
}

/**
 * ⚠️ **Parada largada é a pior solução, nunca a melhor.**
 *
 * O fitness soma custo e penalidade, e uma rota vazia tem os dois em zero — ou seja, *não entregar
 * nada* era o ótimo global. Medido em 2026-09-09: bastou existir um caminho capaz de perder um gene
 * para a população inteira convergir para o cromossomo vazio em 48 gerações. O solver estava certo;
 * a função objetivo é que não sabia que largar carga é proibido.
 *
 * A penalidade é por parada ausente, da ordem do par inalcançável — entregar caro sempre vence não
 * entregar.
 */
function totalFitness(problem: RouteProblem, chromosome: Chromosome): number {
  const present = new Set(chromosome.filter((gene) => gene !== SEPARATOR))
  const missing = problem.stops.filter(
    (stop) =>
      !present.has(stop.index) && problem.vehicles.some((vehicle) => canServe(vehicle, stop.index)),
  ).length

  return (
    missing * DROPPED_STOP_PENALTY_MICROS +
    splitChromosome(chromosome, problem.vehicles.length).reduce(
      (total, stopIndexes, vehicleIndex) =>
        total + routeFitness(evaluateRoute({ problem, stopIndexes, vehicleIndex })),
      0,
    )
  )
}

function sortByFitness(
  problem: RouteProblem,
  population: readonly Chromosome[],
): readonly Chromosome[] {
  return [...population].sort(
    (left, right) => totalFitness(problem, left) - totalFitness(problem, right),
  )
}

function shuffle(values: readonly number[], random: () => number): readonly number[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const held = shuffled[index]
    const other = shuffled[target]
    if (held === undefined || other === undefined) continue
    shuffled[index] = other
    shuffled[target] = held
  }

  return shuffled
}

function buildSolution(input: {
  readonly chromosome: Chromosome
  readonly generations: number
  readonly problem: RouteProblem
  readonly truncated: boolean
}): RouteSolution {
  /**
   * ⚠️ **O reparo também aqui, não só no `refine`.** O melhor indivíduo veio reparado, mas a
   * instância trivial (uma parada só) e o atalho de cobertura vazia entram por outro caminho — e uma
   * solução final que ignora a proibição a tornaria mentira exatamente onde ela é lida.
   */
  const routes = repairCoverage({
    problem: input.problem,
    routes: splitChromosome(input.chromosome, input.problem.vehicles.length),
  })
  const assignments: RouteAssignment[] = []
  const violations: RouteViolation[] = []
  let totalCostMicros = 0
  let totalDistanceMeters = 0
  let totalDurationSeconds = 0

  routes.forEach((stopIndexes, vehicleIndex) => {
    if (input.problem.vehicles[vehicleIndex] === undefined) return

    const evaluated = evaluateRoute({ problem: input.problem, stopIndexes, vehicleIndex })
    assignments.push(evaluated.assignment)
    violations.push(...evaluated.violations)
    totalCostMicros += evaluated.assignment.costMicros
    totalDistanceMeters += evaluated.assignment.distanceMeters
    totalDurationSeconds += evaluated.assignment.durationSeconds
  })

  /**
   * ADR-0044 §5: carga que excede todos os veículos devolve o que cabe e **lista o que sobrou**, em
   * vez de estourar o peso em silêncio. Sobra aqui é parada que nenhuma rota recebeu.
   */
  const assigned = new Set(assignments.flatMap((assignment) => assignment.stopIndexes))
  const unassignedStopIndexes = input.problem.stops
    .map((stop) => stop.index)
    .filter((index) => !assigned.has(index))

  return {
    assignments,
    generations: input.generations,
    optimizationQuality: resolveOptimizationQuality(input),
    totalCostMicros,
    totalDistanceMeters,
    totalDurationSeconds,
    truncated: input.truncated,
    unassignedStopIndexes,
    violations,
  }
}
