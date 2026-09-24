/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Storage em memória que registra cada escrita, e o cliente falso que responde no tempo do teste.
 */
import type { TripClient } from '@/modules/trip/shared/tripClient.service'
import type {
  MultiVehicleSuggestion,
  MultiVehicleSuggestionStatus,
  TripCandidateDocument,
} from '@/modules/trip/shared/trip.types'
import type { TripAssemblyDraftStorage } from '@/modules/trip/shared/tripAssemblyDraftStorage.service'

export type RecordingStorage = TripAssemblyDraftStorage &
  Readonly<{ removals: string[]; writes: string[] }>

export function createRecordingStorage(): RecordingStorage {
  const entries = new Map<string, string>()
  const removals: string[] = []
  const writes: string[] = []
  return {
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
    removals,
    removeItem: (key) => {
      removals.push(key)
      entries.delete(key)
    },
    setItem: (key, value) => {
      writes.push(key)
      entries.set(key, value)
    },
    writes,
  }
}

/** A aba do teste: o hook lê `window.sessionStorage` ao montar. */
export function installSessionStorage(storage: RecordingStorage): void {
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage })
}

export type Deferred<TValue> = Readonly<{
  promise: Promise<TValue>
  resolve: (value: TValue) => void
}>

export function createDeferred<TValue>(): Deferred<TValue> {
  let resolve: (value: TValue) => void = () => undefined
  const promise = new Promise<TValue>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

export type FakeTripClient = Pick<
  TripClient,
  | 'attachOccurrencePhoto'
  | 'createMultiVehicleSuggestion'
  | 'readMultiVehicleProposal'
  | 'readMultiVehicleSuggestion'
  | 'registerTripOccurrence'
>

/** Toda chamada não combinada falha alto: um teste que a dispara está medindo outra coisa. */
export function createUnexpectedTripClient(): FakeTripClient {
  return {
    attachOccurrencePhoto: () => Promise.reject(new Error('UNEXPECTED_ATTACH_OCCURRENCE_PHOTO')),
    createMultiVehicleSuggestion: () => Promise.reject(new Error('UNEXPECTED_CREATE')),
    readMultiVehicleProposal: () => Promise.reject(new Error('UNEXPECTED_PROPOSAL_READ')),
    readMultiVehicleSuggestion: () => Promise.reject(new Error('UNEXPECTED_SUGGESTION_READ')),
    registerTripOccurrence: () => Promise.reject(new Error('UNEXPECTED_REGISTER_TRIP_OCCURRENCE')),
  }
}

export function buildSuggestion(
  input: Readonly<{ id: string; status: MultiVehicleSuggestionStatus }>,
): MultiVehicleSuggestion {
  return {
    endPolicy: 'depot',
    errorCode: null,
    estimatedDistanceMeters: null,
    estimatedDurationSeconds: null,
    id: input.id,
    status: input.status,
    truncated: false,
  }
}

export function buildCandidateDocument(id: string): TripCandidateDocument {
  return {
    accessKey: '35260900000000000000550010000000011000000010',
    cargoGrossWeight: null,
    cargoWeightSource: null,
    emitterName: 'Emitente',
    freightAmount: null,
    freightRuleName: null,
    id,
    issuedAt: '2026-09-18T08:00:00.000Z',
    number: '1',
    recipientAddress: null,
    recipientAddressNumber: null,
    recipientCity: null,
    recipientCityCode: null,
    recipientLatitude: null,
    recipientLocationPrecision: null,
    recipientLongitude: null,
    recipientName: 'Destinatário',
    recipientPhone: null,
    recipientPostalCode: null,
    recipientState: null,
    series: '1',
    status: 'authorized',
    totalAmount: '100.00',
    tripId: null,
  }
}
