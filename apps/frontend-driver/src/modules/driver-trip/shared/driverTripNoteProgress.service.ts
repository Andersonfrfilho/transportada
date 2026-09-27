/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip } from './driverTrip.types'
import { isDocumentSettled } from './driverTripView.service'

export type DriverTripNoteProgress = Readonly<{
  percent: number
  resolved: number
  total: number
}>

/**
 * Spec 198 D7 (decisão do usuário, 25/09): a porcentagem conta **notas**, não paradas — dividir uma
 * parada em duas (spec 197) não pode mudar o número. Arredonda para baixo: 1 de 3 é 33%, e 100% só
 * quando a última nota fecha. A nota liberada já não vem no snapshot.
 */
export function computeTripNoteProgress(trip: DriverTrip): DriverTripNoteProgress | undefined {
  const documents = trip.stops.flatMap((stop) => stop.documents)
  if (documents.length === 0) return undefined

  const resolved = documents.filter(isDocumentSettled).length
  return {
    percent: Math.floor((resolved * 100) / documents.length),
    resolved,
    total: documents.length,
  }
}
