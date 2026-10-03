/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripOccurrenceDetail } from '@/modules/trip/shared/tripOccurrenceFeed.service'

export const DETAIL_FIXTURE_IDS = {
  documentId: 'document-1',
  occurrenceId: 'occurrence-1',
  tripId: 'trip-1',
} as const

/** Dados sintéticos: nenhum nome, documento ou telefone real entra em teste. */
export function buildOccurrenceDetailFixture(
  overrides: Partial<TripOccurrenceDetail> = {},
): TripOccurrenceDetail {
  return {
    actorName: 'Operador de teste',
    cancellation: null,
    case: null,
    channel: 'office',
    conversation: { contractorState: 'none', driverUnreadCount: 0 },
    corrections: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    description: '',
    document: {
      contractor: null,
      destination: null,
      nfeDocumentId: 'nfe-1',
      totalValue: '100.00',
      tripDocumentId: DETAIL_FIXTURE_IDS.documentId,
    },
    driver: null,
    driverName: '',
    hasAttachment: false,
    id: DETAIL_FIXTURE_IDS.occurrenceId,
    invoiceNumber: '1',
    invoiceSeries: '1',
    items: [
      { code: '696', description: 'Produto A', quantity: '3.000', unit: 'box' },
      { code: '697', description: 'Produto B', quantity: null, unit: null },
    ],
    notifies: false,
    onBehalfOfDriverName: null,
    source: 'document',
    stage: 'separation',
    stopLabel: null,
    tripId: DETAIL_FIXTURE_IDS.tripId,
    typeName: 'Item avariado',
    vehiclePlate: 'AAA0A00',
    ...overrides,
  }
}
