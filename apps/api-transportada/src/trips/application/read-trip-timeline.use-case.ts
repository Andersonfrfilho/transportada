/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T6 (D4, aceites 5, 6): resolve a viagem **da empresa do contexto** antes de ler qualquer
 * fonte — 404 `TRIP_NOT_FOUND` para viagem inexistente ou de outra empresa, no mesmo molde de
 * `listTripCosts`/`readTripActionSnapshot` (porta devolve `null`, o caso de uso lança). Só depois
 * repassa ao leitor (`listTripTimeline`, T5).
 */
import { TripNotFoundError } from '../domain/trip.error.js'
import type { ReadTripTimelineResult, TripTimelineCursor } from './trip-timeline.types.js'

export type TripTimelineExistencePort = {
  /** `null` quando a viagem não existe nesta empresa. */
  findTripCompanyScope(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<{ readonly id: string } | null>
}

export type TripTimelineReaderPort = {
  listTripTimeline(input: {
    readonly companyId: string
    readonly cursor: TripTimelineCursor | null
    readonly limit: number
    readonly tripId: string
  }): Promise<ReadTripTimelineResult>
}

export type ReadTripTimelineInput = {
  readonly context: { readonly companyId: string }
  readonly cursor: TripTimelineCursor | null
  readonly limit: number
  readonly tripId: string
}

export function createReadTripTimelineUseCase(dependencies: {
  readonly existence: TripTimelineExistencePort
  readonly reader: TripTimelineReaderPort
}): { execute(input: ReadTripTimelineInput): Promise<ReadTripTimelineResult> } {
  return {
    async execute(input: ReadTripTimelineInput): Promise<ReadTripTimelineResult> {
      const companyId = input.context.companyId
      const trip = await dependencies.existence.findTripCompanyScope({
        companyId,
        tripId: input.tripId,
      })
      if (trip === null) throw new TripNotFoundError()

      return dependencies.reader.listTripTimeline({
        companyId,
        cursor: input.cursor,
        limit: input.limit,
        tripId: input.tripId,
      })
    },
  }
}
