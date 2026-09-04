/* Copyright (c) 2026 Ada Technology. MIT License. */
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
  return {
    suggestion: multiVehicleSuggestionFromApi(payload.suggestion),
    trips: payload.trips.map(acceptedTripFromApi),
  }
}
