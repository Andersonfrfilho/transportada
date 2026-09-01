/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { evaluateRoute, routeFitness } from './route-fitness.policy.js'
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
export function improveWithTwoOpt(input: {
  readonly maxPasses?: number
  readonly problem: RouteProblem
  readonly stopIndexes: readonly number[]
  readonly vehicleIndex: number
}): readonly number[] {
  const maxPasses = input.maxPasses ?? 4
  let best: readonly number[] = [...input.stopIndexes]
  let bestFitness = fitnessOf(input.problem, best, input.vehicleIndex)

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improvedThisPass = false

    for (let start = 0; start < best.length - 1; start += 1) {
      for (let end = start + 1; end < best.length; end += 1) {
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
