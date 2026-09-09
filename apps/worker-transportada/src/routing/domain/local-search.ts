/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { evaluateRoute, routeFitness } from './route-fitness.policy.js'
import type { RouteNeighbourhood } from './neighbourhood.js'
import type { RouteProblem } from './route-solver.types.js'

/**
 * ADR-0044 §8: o gerador é semeado e explícito. `Math.random()` num GA é o que torna a reclamação de
 * "ontem deu outro roteiro" impossível de reproduzir — e a suíte de baseline, impossível de escrever.
 *
 * `mulberry32`: 32 bits de estado, distribuição boa o suficiente para busca estocástica, e curto o
 * bastante para caber aqui sem virar dependência.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state)
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * `2-opt`: inverte um trecho da rota e fica com a inversão se ela sair mais barata. É a busca local
 * que a ADR-0044 §4 exige em todo indivíduo antes de ele entrar na população — é a hibridização que
 * separa um GA memético de um brinquedo, porque **um GA puro é pior que `2-opt` numa parada só**.
 *
 * A avaliação é a completa, com penalidade: um trecho que encurta o caminho e estoura a janela não é
 * melhoria, e um `2-opt` que só olhasse distância a aceitaria.
 */
const NEVER_STOP = (): boolean => false

/**
 * Os fins de segmento que vale tentar a partir de `start`. Sem vizinhança, todos — o 2-opt clássico.
 * Com vizinhança, só os que ligam a parada de `start` a uma das K mais próximas dela.
 */
function candidateEnds(input: {
  readonly best: readonly number[]
  readonly neighbourhood: RouteNeighbourhood | undefined
  readonly start: number
}): readonly number[] {
  const { best, neighbourhood, start } = input
  if (neighbourhood === undefined) {
    return Array.from({ length: best.length - start - 1 }, (_value, offset) => start + offset + 1)
  }

  const anchor = best[start]
  if (anchor === undefined) return []
  const near = new Set(neighbourhood.get(anchor) ?? [])

  const ends: number[] = []
  for (let end = start + 1; end < best.length; end += 1) {
    const candidate = best[end]
    if (candidate !== undefined && near.has(candidate)) ends.push(end)
  }

  return ends
}

/**
 * A variação de distância do movimento 2-opt, em O(1): saem as arestas `(a,b)` e `(c,d)`, entram
 * `(a,c)` e `(b,d)`. Negativo é melhoria.
 *
 * ⚠️ Aresta desconhecida (`null` na matriz) devolve `-1` — "vale avaliar": recusar aqui esconderia
 * do 2-opt exatamente o movimento que pode tirar a rota de um trecho inalcançável, e quem decide
 * sobre inalcançável é a avaliação completa, que tem a penalidade para isso.
 */
function distanceDelta(input: {
  readonly best: readonly number[]
  readonly end: number
  readonly problem: RouteProblem
  readonly start: number
}): number {
  const { best, end, problem, start } = input
  const before = start === 0 ? problem.depotIndex : best[start - 1]
  const first = best[start]
  const last = best[end]
  const after = end + 1 < best.length ? best[end + 1] : readTail(problem)

  if (before === undefined || first === undefined || last === undefined || after === undefined) {
    return -1
  }

  const removed = edge(problem, before, first) + edge(problem, last, after)
  const added = edge(problem, before, last) + edge(problem, first, after)
  /** ⚠️ `NaN` é aresta desconhecida, e `NaN >= 0` é `false` — sem esta guarda o filtro deixaria
   * passar tudo, silenciosamente, e o ganho de desempenho sumiria sem nenhum teste acusar. */
  if (Number.isNaN(removed) || Number.isNaN(added)) return -1

  return added - removed
}

function edge(problem: RouteProblem, from: number, to: number): number {
  return problem.distancesMeters[from]?.[to] ?? Number.NaN
}

/** O fim da rota: o ponto de retorno quando existe, senão o próprio depósito. */
function readTail(problem: RouteProblem): number {
  return problem.endIndex ?? problem.depotIndex
}

export function improveWithTwoOpt(input: {
  readonly maxPasses?: number
  readonly problem: RouteProblem
  /**
   * Spec 104 D1: **o orçamento é conferido aqui, onde o tempo é gasto.** Conferi-lo só entre
   * gerações fazia 30 s declarados virarem 183 s medidos — uma única passada de 2-opt com 345
   * paradas leva minutos, e o laço de fora não tinha como saber disso.
   *
   * Interrompido, devolve **a melhor rota já conhecida**: `best` é sempre uma permutação completa,
   * nunca um estado intermediário.
   */
  /**
   * Spec 105: a vizinhança granular. Ausente, o comportamento é o clássico — todos os pares —, que
   * é o que as instâncias pequenas dos testes de referência esperam.
   */
  readonly neighbourhood?: RouteNeighbourhood | undefined
  readonly shouldStop?: () => boolean
  readonly stopIndexes: readonly number[]
  readonly vehicleIndex: number
}): readonly number[] {
  const maxPasses = input.maxPasses ?? 4
  const shouldStop = input.shouldStop ?? NEVER_STOP
  let best: readonly number[] = [...input.stopIndexes]
  let bestFitness = fitnessOf(input.problem, best, input.vehicleIndex)

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improvedThisPass = false

    for (let start = 0; start < best.length - 1; start += 1) {
      /**
       * ⚠️ A conferência é no laço **externo** dos candidatos, não no interno: o relógio custa, e
       * consultá-lo a cada par de índices pagaria o custo O(n²) vezes por passada.
       */
      if (shouldStop()) return best

      for (const end of candidateEnds({ best, neighbourhood: input.neighbourhood, start })) {
        /**
         * ⚠️ **Filtro por delta de distância antes da avaliação completa.** Trocar as arestas
         * `(a,b)` e `(c,d)` por `(a,c)` e `(b,d)` tem delta calculável em O(1); a avaliação
         * completa é O(n) e é o que fazia cada passada custar O(n³).
         *
         * O filtro é **conservador de propósito**: ele só descarta movimento que nem encurta o
         * caminho. Janela de tempo e jornada não são decomponíveis em O(1) — reverter um trecho
         * muda a hora de chegada de tudo o que vem depois —, então quem aceita continua sendo a
         * avaliação completa. O delta escolhe **quem vale avaliar**, nunca quem entra.
         */
        if (distanceDelta({ best, end, problem: input.problem, start }) >= 0) continue

        const candidate = reverseSegment(best, start, end)
        const candidateFitness = fitnessOf(input.problem, candidate, input.vehicleIndex)
        if (candidateFitness < bestFitness) {
          best = candidate
          bestFitness = candidateFitness
          improvedThisPass = true
        }
      }
    }

    // Uma passada inteira sem melhorar é o ótimo local: continuar só gasta orçamento
    if (!improvedThisPass) break
  }

  return best
}

/**
 * Vizinho mais próximo — o construtor guloso que também é **metade do baseline** da ADR-0044 §4. Ele
 * existe aqui para ser batido: se o GA não vencer `nearestNeighbour` + `2-opt`, o CI falha.
 */
export function buildNearestNeighbourRoute(input: {
  readonly problem: RouteProblem
  readonly stopIndexes: readonly number[]
}): readonly number[] {
  const remaining = new Set(input.stopIndexes)
  const ordered: number[] = []
  let current = input.problem.depotIndex

  while (remaining.size > 0) {
    let nearest: number | null = null
    let nearestDuration = Number.POSITIVE_INFINITY

    for (const candidate of remaining) {
      const duration = input.problem.durationsSeconds[current]?.[candidate]
      if (duration === null || duration === undefined) continue
      if (duration < nearestDuration) {
        nearest = candidate
        nearestDuration = duration
      }
    }

    // Nada alcançável a partir daqui: o resto entra na ordem em que veio, e a avaliação acusa
    if (nearest === null) {
      ordered.push(...remaining)
      break
    }

    ordered.push(nearest)
    remaining.delete(nearest)
    current = nearest
  }

  return ordered
}

function reverseSegment(
  stopIndexes: readonly number[],
  start: number,
  end: number,
): readonly number[] {
  return [
    ...stopIndexes.slice(0, start),
    ...stopIndexes.slice(start, end + 1).toReversed(),
    ...stopIndexes.slice(end + 1),
  ]
}

function fitnessOf(
  problem: RouteProblem,
  stopIndexes: readonly number[],
  vehicleIndex: number,
): number {
  return routeFitness(evaluateRoute({ problem, stopIndexes, vehicleIndex }))
}
