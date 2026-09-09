/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolveLeftoverStops } from '@/modules/routing/shared/suggestionLeftover.service'
import { TRIP_ERROR } from './trip.constant'
import type {
  AcceptedMultiVehicleSuggestion,
  AcceptedMultiVehicleTrip,
  MultiVehicleSuggestion,
  MultiVehicleSuggestionStatus,
} from './trip.types'
import { isBoolean, isRecord, isString } from './tripGuards.validation'

const STATUSES: readonly MultiVehicleSuggestionStatus[] = [
  'accepted',
  'failed',
  'queued',
  'ready',
  'rejected',
  'running',
  'stale',
]

function readOptionalNumber(value: unknown): null | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStatus(value: unknown): MultiVehicleSuggestionStatus {
  const status = STATUSES.find((candidate) => candidate === value)
  if (status === undefined) throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  return status
}

export function multiVehicleSuggestionFromApi(payload: unknown): MultiVehicleSuggestion {
  if (!isRecord(payload) || !isString(payload.id)) throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  return {
    errorCode: isString(payload.errorCode) ? payload.errorCode : null,
    estimatedDistanceMeters: readOptionalNumber(payload.estimatedDistanceMeters),
    estimatedDurationSeconds: readOptionalNumber(payload.estimatedDurationSeconds),
    id: payload.id,
    status: readStatus(payload.status),
    truncated: isBoolean(payload.truncated) ? payload.truncated : false,
  }
}

function acceptedTripFromApi(payload: unknown): AcceptedMultiVehicleTrip {
  if (!isRecord(payload) || !isString(payload.tripId) || !isString(payload.vehicleId)) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  return {
    documentCount: readOptionalNumber(payload.documentCount) ?? 0,
    /** Spec 107 D3: quando este caminhão fica livre — a hora que a frase da sobra imprime. */
    estimatedFinishAt: isString(payload.estimatedFinishAt) ? payload.estimatedFinishAt : null,
    stopCount: readOptionalNumber(payload.stopCount) ?? 0,
    tripId: payload.tripId,
    vehicleId: payload.vehicleId,
  }
}

export function acceptedMultiVehicleSuggestionFromApi(
  payload: unknown,
): AcceptedMultiVehicleSuggestion {
  if (!isRecord(payload) || !Array.isArray(payload.trips)) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  /**
   * ⚠️ Campo ausente é resposta anterior à spec 107: lista vazia, nunca erro. A tela some com o
   * aviso, e é o comportamento de antes — nunca uma tela quebrada durante o deploy.
   */
  const skipped = Array.isArray(payload.skippedDocuments) ? payload.skippedDocuments : []
  const stops =
    isRecord(payload.suggestion) && Array.isArray(payload.suggestion.stops)
      ? payload.suggestion.stops
      : []

  return {
    /**
     * ⚠️ A regra mora em `routing/shared/suggestionLeftover.service.ts`, **uma vez**. Reimplementá-la
     * aqui produziria duas definições de "sobra" que divergiriam no dia em que uma terceira causa
     * aparecesse — e `trip` já importa de `routing` em três outros lugares.
     */
    leftoverStops: resolveLeftoverStops(
      stops.flatMap((stop) =>
        isRecord(stop)
          ? [
              {
                excludedFromOptimization: stop.excludedFromOptimization === true,
                label: typeof stop.label === 'string' ? stop.label : '',
                nfeDocumentIds: Array.isArray(stop.nfeDocumentIds)
                  ? stop.nfeDocumentIds.filter((id): id is string => typeof id === 'string')
                  : [],
                vehicleId: typeof stop.vehicleId === 'string' ? stop.vehicleId : null,
              },
            ]
          : [],
      ),
    ),
    skippedDocuments: skipped.flatMap((entry) =>
      isRecord(entry) && typeof entry.nfeDocumentId === 'string'
        ? [
            {
              nfeDocumentId: entry.nfeDocumentId,
              reason: typeof entry.reason === 'string' ? entry.reason : 'already_linked',
            },
          ]
        : [],
    ),
    suggestion: multiVehicleSuggestionFromApi(payload.suggestion),
    trips: payload.trips.map(acceptedTripFromApi),
  }
}
