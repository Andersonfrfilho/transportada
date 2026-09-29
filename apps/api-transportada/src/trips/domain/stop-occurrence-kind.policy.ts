/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 D2: o tipo de parada sem `stop_kind` (criado pelo operador antes do cadastro gravar o
 * valor) vale como `other` — a mesma regra no registro e no catálogo que o app lê.
 */
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'

export function resolveStopOccurrenceKind(
  stopKind: TripStopOccurrenceKind | null,
): TripStopOccurrenceKind {
  return stopKind ?? 'other'
}
