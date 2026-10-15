/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: a lista das ocorrências da viagem atual do motorista. Sem viagem atual (ou já
 * finalizada) é `DRIVER_TRIP_NOT_ACTIVE`.
 */
import { buildDriverRouteOccurrenceItem } from '../domain/driver-route-occurrence.policy.js'
import type { DriverRouteOccurrenceItem } from '../domain/driver-route-occurrence.types.js'
import { DriverTripNotActiveError } from '../domain/trip.error.js'
import type { DriverRouteOccurrenceReaderPort } from './driver-route-occurrence.port.js'

export type ListDriverRouteOccurrencesInput = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
}

export type ListDriverRouteOccurrencesUseCase = {
  readonly execute: (
    input: ListDriverRouteOccurrencesInput,
  ) => Promise<readonly DriverRouteOccurrenceItem[]>
}

export function createListDriverRouteOccurrencesUseCase(dependencies: {
  readonly reader: DriverRouteOccurrenceReaderPort
}): ListDriverRouteOccurrencesUseCase {
  return {
    async execute(input) {
      const tripId = await dependencies.reader.findCurrentTripId(input)
      if (tripId === null) throw new DriverTripNotActiveError()
      const occurrences = await dependencies.reader.readOccurrences({
        companyId: input.companyId,
        driverUserId: input.driverUserId,
        tripId,
      })
      return occurrences.map(buildDriverRouteOccurrenceItem)
    },
  }
}
