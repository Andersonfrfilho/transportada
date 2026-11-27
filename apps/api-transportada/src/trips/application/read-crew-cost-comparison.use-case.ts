/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  buildCrewCostComparison,
  type CrewCostComparison,
} from '../domain/crew-cost-comparison.policy.js'
import type { TripValuationContext } from './read-trip-valuation.use-case.js'

export type CrewCostComparisonTrip = {
  readonly createdAt: string
  readonly crewNames: readonly string[]
  readonly status: string
  readonly tripId: string
}

export type CrewCostComparisonRow = CrewCostComparison & CrewCostComparisonTrip

export type ReadCrewCostComparisonPort = {
  /** Viagens da empresa criadas na janela, com ao menos uma pessoa com valor informado. */
  listTripsWithPaidAmount(input: {
    readonly companyId: string
    readonly from: string
    readonly to: string
  }): Promise<readonly CrewCostComparisonTrip[]>
  readValuationContexts(input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<ReadonlyMap<string, TripValuationContext>>
}

/** Teto de linhas da página; a consulta lê uma a mais para saber se cortou. */
export const CREW_COST_COMPARISON_MAX_TRIPS = 200

export type CrewCostComparisonPage = {
  readonly items: readonly CrewCostComparisonRow[]
  /** Havia mais viagens no período do que o teto: a lista está cortada. */
  readonly truncated: boolean
}

export type ReadCrewCostComparisonInput = {
  readonly companyId: string
  readonly from: string
  readonly to: string
}

/**
 * Spec 327: a página "gasto × custo". Só entra viagem com valor informado — sem ele não há o que
 * comparar. O contexto vem do mesmo leitor em lote da lista de viagens (259), então a conta é a da viagem.
 */
export function createReadCrewCostComparison(repository: ReadCrewCostComparisonPort) {
  return {
    async execute(input: ReadCrewCostComparisonInput): Promise<CrewCostComparisonPage> {
      const found = await repository.listTripsWithPaidAmount(input)
      const truncated = found.length > CREW_COST_COMPARISON_MAX_TRIPS
      const trips = found.slice(0, CREW_COST_COMPARISON_MAX_TRIPS)
      if (trips.length === 0) return { items: [], truncated }

      const contexts = await repository.readValuationContexts({
        companyId: input.companyId,
        tripIds: trips.map((trip) => trip.tripId),
      })

      const items = trips.flatMap((trip) => {
        const context = contexts.get(trip.tripId)

        return context === undefined ? [] : [{ ...trip, ...buildCrewCostComparison(context) }]
      })

      return { items, truncated }
    },
  }
}
