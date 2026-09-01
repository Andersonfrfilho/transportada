/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, DriverTripDocument, DriverTripStop } from './driverTrip.types'

/** Entregue e devolvida saíram do eixo do campo: não há mais o que tocar nelas. */
const SETTLED_STATUSES = ['delivered', 'returned']

export function isDocumentSettled(document: DriverTripDocument): boolean {
  return SETTLED_STATUSES.includes(document.separationStatus)
}

export function isStopPending(stop: DriverTripStop): boolean {
  return stop.completedAt === null
}

/**
 * A primeira pendente é a que o motorista está fazendo agora — é ela que a tela destaca. Sem isso
 * ele lê a lista inteira em cada parada para achar onde está, com o caminhão parado em fila dupla.
 */
export function findCurrentStop(trip: DriverTrip): DriverTripStop | undefined {
  return trip.stops.find(isStopPending)
}

export function countPendingDocuments(stop: DriverTripStop): number {
  return stop.documents.filter((document) => !isDocumentSettled(document)).length
}

/**
 * ADR-0045 §8: navegar é delegar. O endereço vai como busca para o app de mapa que a pessoa já usa;
 * a coordenada entra quando existe, porque pino é melhor que texto quando o endereço é ambíguo.
 */
export function buildNavigationHref(stop: DriverTripStop): string {
  if (stop.latitude !== null && stop.longitude !== null) {
    return `https://maps.google.com/?q=${stop.latitude},${stop.longitude}`
  }

  return `https://maps.google.com/?q=${encodeURIComponent(stop.label)}`
}
