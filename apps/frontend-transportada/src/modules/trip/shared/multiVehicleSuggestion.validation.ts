/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteEndPolicy } from './trip.types'
import { resolveLeftoverStops } from '@/modules/routing/shared/suggestionLeftover.service'
import { TRIP_ERROR } from './trip.constant'
import type {
  AcceptedMultiVehicleSuggestion,
  AcceptedMultiVehicleTrip,
  MultiVehicleProposal,
  MultiVehicleSuggestion,
  MultiVehicleSuggestionStatus,
  ProposalStop,
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
  const assumptions = isRecord(payload.assumptions) ? payload.assumptions : {}

  return {
    /** Corpo sem `assumptions` cai em `depot`, que é o padrão da coluna no banco. */
    endPolicy: readEndPolicy(assumptions.endPolicy),
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

/**
 * Spec 108: as paradas propostas, na forma mínima que a cobertura e a proposta leem. Ela é usada
 * pela leitura da proposta **e** pelo aceite — duas formas para a mesma linha divergiriam no dia em
 * que a API acrescentasse um campo.
 */
export function coverableStopsFromApi(payload: unknown): readonly ProposalStop[] {
  const stops = isRecord(payload) && Array.isArray(payload.stops) ? payload.stops : []

  return stops.flatMap((stop) =>
    isRecord(stop)
      ? [
          {
            /**
             * ⚠️ Spec 110: **a API sempre mandou os cinco de baixo, e este mapa lia quatro campos de
             * doze.** `serializeSuggestion` devolve `suggestion.stops` sem recorte; era aqui que a
             * ETA e a quilometragem da perna morriam, uma linha antes de virarem tela.
             *
             * Ausência é `null`, nunca zero: perna desenhada como `0 km` diria que a parada é na
             * porta da anterior — e a primeira do dia não tem perna anterior nenhuma.
             */
            distanceFromPreviousMeters: readOptionalNumber(stop.distanceFromPreviousMeters),
            durationFromPreviousSeconds: readOptionalNumber(stop.durationFromPreviousSeconds),
            estimatedArrivalAt: isString(stop.estimatedArrivalAt) ? stop.estimatedArrivalAt : null,
            excludedFromOptimization: stop.excludedFromOptimization === true,
            geocodingPrecision: isString(stop.geocodingPrecision) ? stop.geocodingPrecision : null,
            label: typeof stop.label === 'string' ? stop.label : '',
            /** A razão da sobra, como a API a manda. Ausente é sugestão anterior à coluna. */
            leftoverReason: isString(stop.leftoverReason) ? stop.leftoverReason : null,
            nfeDocumentIds: Array.isArray(stop.nfeDocumentIds)
              ? stop.nfeDocumentIds.filter((id): id is string => typeof id === 'string')
              : [],
            sequence: readOptionalNumber(stop.sequence) ?? 0,
            vehicleId: typeof stop.vehicleId === 'string' ? stop.vehicleId : null,
          },
        ]
      : [],
  )
}

/**
 * Spec 108: a proposta como ela chega da leitura — sugestão **mais** paradas. A leitura anterior
 * descartava as paradas, e era por isso que a tela não tinha o que mostrar antes do aceite.
 */
export function multiVehicleProposalFromApi(payload: unknown): MultiVehicleProposal {
  return {
    stops: coverableStopsFromApi(payload),
    suggestion: multiVehicleSuggestionFromApi(payload),
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
  return {
    /**
     * ⚠️ A regra mora em `routing/shared/suggestionLeftover.service.ts`, **uma vez**. Reimplementá-la
     * aqui produziria duas definições de "sobra" que divergiriam no dia em que uma terceira causa
     * aparecesse — e `trip` já importa de `routing` em três outros lugares.
     */
    leftoverStops: resolveLeftoverStops(coverableStopsFromApi(payload.suggestion)),
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

const END_POLICIES: readonly RouteEndPolicy[] = ['address', 'depot', 'last_stop']

function readEndPolicy(value: unknown): RouteEndPolicy {
  return END_POLICIES.find((candidate) => candidate === value) ?? 'depot'
}
