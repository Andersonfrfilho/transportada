/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 105: **vizinhança granular** — para cada parada, as K mais próximas.
 *
 * O 2-opt clássico varre todos os O(n²) pares. Com 305 paradas isso é 46 mil candidatos por
 * passada, cada um custando uma avaliação completa O(n) — e é por isso que o solver não completava
 * uma geração. A literatura resolve isso desde Toth & Vigo (2003, *granular tabu search*): um
 * movimento que liga duas paradas distantes quase nunca melhora, então nem se avalia.
 *
 * ⚠️ **É uma heurística, e ela custa alguma coisa.** Com K pequeno demais o ótimo local piora. K=20
 * é o valor que a literatura de VRP usa como padrão e é o que medimos aqui.
 */
import type { RouteProblem } from './route-solver.types.js'

export const DEFAULT_NEIGHBOUR_COUNT = 20

/** Para cada índice de parada, os vizinhos mais próximos em ordem crescente de duração. */
export type RouteNeighbourhood = ReadonlyMap<number, readonly number[]>

/**
 * ⚠️ Construída **uma vez por problema**, nunca por indivíduo: com 40 indivíduos por geração, montá-la
 * dentro do laço custaria mais que o 2-opt que ela veio acelerar.
 *
 * A seleção é por inserção num vetor de tamanho K, não por ordenação da linha inteira: ordenar seria
 * O(n log n) por parada e aqui é O(n·K), com K ≪ n.
 */
export function buildNeighbourhood(input: {
  readonly neighbourCount?: number
  readonly problem: RouteProblem
  readonly stopIndexes: readonly number[]
}): RouteNeighbourhood {
  const limit = input.neighbourCount ?? DEFAULT_NEIGHBOUR_COUNT
  const neighbourhood = new Map<number, readonly number[]>()

  for (const from of input.stopIndexes) {
    const row = input.problem.durationsSeconds[from]
    if (row === undefined) {
      neighbourhood.set(from, [])
      continue
    }

    /** Vetor ordenado de no máximo `limit` pares — inserção binária seria exagero para K=20. */
    const nearest: { duration: number; index: number }[] = []
    for (const to of input.stopIndexes) {
      if (to === from) continue
      const duration = row[to]
      if (duration === null || duration === undefined) continue
      if (nearest.length === limit && duration >= (nearest[limit - 1]?.duration ?? 0)) continue

      const position = nearest.findIndex((entry) => duration < entry.duration)
      const candidate = { duration, index: to }
      if (position === -1) nearest.push(candidate)
      else nearest.splice(position, 0, candidate)
      if (nearest.length > limit) nearest.pop()
    }

    neighbourhood.set(
      from,
      nearest.map((entry) => entry.index),
    )
  }

  return neighbourhood
}
