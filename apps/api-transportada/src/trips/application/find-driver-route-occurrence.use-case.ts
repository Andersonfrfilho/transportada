/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o detalhe de uma ocorrência da viagem atual. Inexistente, de outra viagem e de
 * outra empresa respondem o mesmo 404: a diferença confirmaria a existência.
 */
import { buildDriverRouteOccurrenceDetail } from '../domain/driver-route-occurrence.policy.js'
import type { DriverRouteOccurrenceDetail } from '../domain/driver-route-occurrence.types.js'
import { DriverTripNotActiveError, TripOccurrenceNotFoundError } from '../domain/trip.error.js'
import type { DriverRouteOccurrenceReaderPort } from './driver-route-occurrence.port.js'
import type { OccurrenceKind } from './occurrence-resolution.port.js'

export type FindDriverRouteOccurrenceInput = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
}

export type FindDriverRouteOccurrenceUseCase = {
  readonly execute: (input: FindDriverRouteOccurrenceInput) => Promise<DriverRouteOccurrenceDetail>
}

export function createFindDriverRouteOccurrenceUseCase(dependencies: {
  readonly reader: DriverRouteOccurrenceReaderPort
}): FindDriverRouteOccurrenceUseCase {
  return {
    async execute(input) {
      const tripId = await dependencies.reader.findCurrentTripId(input)
      if (tripId === null) throw new DriverTripNotActiveError()
      const [facts] = await dependencies.reader.readOccurrences({
        companyId: input.companyId,
        driverUserId: input.driverUserId,
        target: { id: input.occurrenceId, kind: input.occurrenceKind },
        tripId,
      })
      if (facts === undefined) throw new TripOccurrenceNotFoundError()
      return buildDriverRouteOccurrenceDetail(facts)
    },
  }
}
