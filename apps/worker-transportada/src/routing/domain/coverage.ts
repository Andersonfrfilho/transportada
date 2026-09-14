/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 106: **região é proibição.** O motorista só vai onde ele cobre, e a parada que ninguém cobre
 * não tem destino — ela volta como sobra, cumprindo a ADR-0044 §5, que promete isso desde sempre e
 * nunca teve caminho ativo.
 */
import type { RouteProblem, RouteVehicleInput } from './route-solver.types.js'

/** `null` no veículo é ausência de restrição; conjunto vazio é "não serve nada". */
export function canServe(vehicle: RouteVehicleInput, stopIndex: number): boolean {
  return vehicle.servableStopIndexes === null || vehicle.servableStopIndexes.has(stopIndex)
}

/**
 * As paradas que **algum** veículo cobre. As outras nunca entram no cromossomo: mantê-las lá
 * obrigaria cada indivíduo a carregá-las sem destino, e os operadores genéticos as passeariam entre
 * veículos que não podem servi-las.
 */
export function partitionByCoverage(problem: RouteProblem): {
  readonly servable: readonly number[]
  readonly unservable: readonly number[]
} {
  const servable: number[] = []
  const unservable: number[] = []

  for (const stop of problem.stops) {
    const covered = problem.vehicles.some((vehicle) => canServe(vehicle, stop.index))
    if (covered) servable.push(stop.index)
    else unservable.push(stop.index)
  }

  return { servable, unservable }
}

/**
 * Move para um veículo que a cubra toda parada que caiu no veículo errado.
 *
 * ⚠️ **Não descarta nada**, e é isso que mantém o GA correto: o cromossomo tem sempre o mesmo
 * conjunto de genes, e o *order crossover* depende disso — dois pais com conjuntos diferentes
 * produziriam filho com parada repetida ou perdida. Como `partitionByCoverage` já tirou o que
 * ninguém cobre, sempre existe destino.
 *
 * O destino é o veículo **com menos paradas** entre os que cobrem: sem esse critério a sobra
 * empilharia toda no primeiro da lista, que é o efeito de fronteira que a spec 104 D3 já combate.
 */
export function repairCoverage(input: {
  readonly problem: RouteProblem
  readonly routes: readonly (readonly number[])[]
}): readonly (readonly number[])[] {
  const { problem, routes } = input
  if (problem.vehicles.every((vehicle) => vehicle.servableStopIndexes === null)) return routes

  const repaired = routes.map((route) => [...route])

  routes.forEach((route, vehicleIndex) => {
    const vehicle = problem.vehicles[vehicleIndex]
    if (vehicle === undefined) return

    for (const stopIndex of route) {
      if (canServe(vehicle, stopIndex)) continue

      const target = chooseTarget({ problem, repaired, stopIndex })
      /**
       * ⚠️ **Nunca descarta.** Sem destino, a parada fica onde está e a avaliação a acusa com
       * `region_not_covered`.
       *
       * Medido em 2026-09-09: a versão que descartava esvaziou o cromossomo em 48 gerações. Sob um
       * fitness que soma custo e penalidade, **rota vazia é ótima** — zero distância, zero
       * violação —, então bastou um caminho capaz de perder gene para o GA encontrá-lo e a
       * população inteira convergir para "não entregar nada". O solver estava certo; a função
       * objetivo é que não tinha como saber que largar carga é proibido.
       */
      if (target === null) continue

      const source = repaired[vehicleIndex]
      if (source === undefined) continue
      source.splice(source.indexOf(stopIndex), 1)
      repaired[target]?.push(stopIndex)
    }
  })

  return repaired
}

function chooseTarget(input: {
  readonly problem: RouteProblem
  readonly repaired: readonly (readonly number[])[]
  readonly stopIndex: number
}): number | null {
  let best: number | null = null
  let bestSize = Number.POSITIVE_INFINITY

  input.problem.vehicles.forEach((vehicle, index) => {
    if (!canServe(vehicle, input.stopIndex)) return
    const size = input.repaired[index]?.length ?? 0
    if (size < bestSize) {
      best = index
      bestSize = size
    }
  })

  return best
}
