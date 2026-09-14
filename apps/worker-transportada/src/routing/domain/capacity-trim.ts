/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteProblem } from './route-solver.types.js'

export type CapacityTrim = Readonly<{
  routes: readonly (readonly number[])[]
  /** O que passou do teto do caminhão. Ele fica para a próxima viagem, nomeado. */
  overCapacityStopIndexes: readonly number[]
  /**
   * Quanto ficou de fora, por veículo, **em quilos**.
   *
   * ⚠️ A ADR-0044 §9 exige o número, não o adjetivo: "não coube" manda o operador adivinhar se
   * falta meia tonelada ou um caminhão inteiro. O que muda com o corte é o **significado** — antes
   * era o excesso que o caminhão levaria a mais; agora é o que ficou para a próxima viagem.
   */
  trimmedByVehicle: readonly Readonly<{
    kilograms: number
    stopIndexes: readonly number[]
    vehicleIndex: number
  }>[]
}>

/**
 * **O que passa do que o veículo carrega fica para a próxima viagem.**
 *
 * A ADR-0044 §5 e o próprio `RouteSolution.unassignedStopIndexes` já diziam isto — _"paradas que
 * nenhum veículo comportou vêm listadas, não empurradas estourando o peso"_ —, e ninguém executava:
 * o cromossomo cobre todas as paradas, então a sobra saía sempre vazia e o excesso virava caminhão
 * acima do teto. Medido em 2026-09-09 numa distribuição real: 37,5 t de carga para 27,9 t de frota,
 * e quatro dos cinco caminhões nasceram estourados — a Fiorino de 650 kg com 4.307 kg, 663%.
 *
 * ⚠️ **O corte é no fim da rota, na ordem de visita** — nunca escolhendo "quais cabem". Escolher
 * refaria por fora a decisão que o solver avaliou, e devolveria um trajeto que a conta ao lado não
 * descreve. Cortar a cauda preserva o roteiro medido e tira a carga que o caminhão não leva.
 *
 * ⚠️ **Veículo sem teto conhecido não é veículo sem limite**: `capacityKilograms <= 0` é ausência de
 * medida (spec 088), e ali a rota passa inteira — inventar um teto seria decidir por quem não mediu.
 */
export function trimRoutesToCapacity(input: {
  readonly problem: RouteProblem
  readonly routes: readonly (readonly number[])[]
}): CapacityTrim {
  const weightByIndex = new Map(
    input.problem.stops.map((stop) => [stop.index, stop.weightKilograms]),
  )
  const overCapacityStopIndexes: number[] = []
  const trimmedByVehicle: {
    kilograms: number
    stopIndexes: readonly number[]
    vehicleIndex: number
  }[] = []

  const routes = input.routes.map((stopIndexes, vehicleIndex) => {
    const capacity = input.problem.vehicles[vehicleIndex]?.capacityKilograms ?? 0
    if (capacity <= 0) return stopIndexes

    const kept: number[] = []
    const trimmed: number[] = []
    let load = 0
    let trimmedKilograms = 0
    let cutting = false

    for (const stopIndex of stopIndexes) {
      const weight = weightByIndex.get(stopIndex) ?? 0
      /**
       * ⚠️ Uma vez cortado, o resto vai junto: manter a parada seguinte só porque ela é leve
       * reordenaria a entrega — a de trás passaria à frente da que ficou para amanhã.
       */
      if (cutting || load + weight > capacity) {
        cutting = true
        trimmed.push(stopIndex)
        overCapacityStopIndexes.push(stopIndex)
        trimmedKilograms += weight
        continue
      }
      kept.push(stopIndex)
      load += weight
    }

    if (trimmed.length > 0) {
      trimmedByVehicle.push({ kilograms: trimmedKilograms, stopIndexes: trimmed, vehicleIndex })
    }

    return kept
  })

  return { overCapacityStopIndexes, routes, trimmedByVehicle }
}
