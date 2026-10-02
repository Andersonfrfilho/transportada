/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverTripDocument,
  DriverTripStop,
} from '@/modules/driver-trip/shared/driverTrip.types'

/** Chave sintética de 44 dígitos — nenhuma nota real entra em fixture. */
const SYNTHETIC_ACCESS_KEY = '35260712345678000195550010009001231000000017'

export function buildDriverTripDocument(
  overrides: Partial<DriverTripDocument> = {},
): DriverTripDocument {
  return {
    accessKey: SYNTHETIC_ACCESS_KEY,
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '12.500',
    id: 'document-1',
    number: '900123',
    occurrenceTypes: null,
    proofPending: false,
    recipientDisplayName: 'Mercearia do Centro',
    recipientIsCompany: true,
    recipientName: 'Mercearia do Centro',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '1500.00',
    volumeCount: '3',
    ...overrides,
  }
}

export function buildDriverTripStop(overrides: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [buildDriverTripDocument()],
    id: 'stop-1',
    label: 'Rua da Saudade, 110, Santo Antonio do Jardim, SP',
    latitude: '-23.5505',
    longitude: '-46.6333',
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}
