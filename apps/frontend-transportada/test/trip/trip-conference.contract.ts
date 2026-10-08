/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildTripConference } from '@/modules/trip/shared/tripConference.service'
import type { TripDocumentDetail, TripStopDetail } from '@/modules/trip/shared/trip.types'

function document(overrides: Partial<TripDocumentDetail>): TripDocumentDetail {
  return {
    cteAuthorized: false,
    createdAt: '2026-10-08T10:00:00Z',
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'pending',
    freightCalculationId: null,
    id: 'document-1',
    loadedAt: null,
    nfeDocumentId: null,
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: 'trip-1',
    updatedAt: '2026-10-08T10:00:00Z',
    ...overrides,
  }
}

function stop(overrides: Partial<TripStopDetail>): TripStopDetail {
  return {
    addressKey: 'key',
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-1',
    label: 'RUA A, 10, PORTO FERREIRA, SP',
    sequence: 1,
    ...overrides,
  }
}

describe('buildTripConference', () => {
  it('soma notas, valor e volumes sem passar por float', () => {
    const first = document({ id: 'a', nfeNumber: '100', nfeTotalValue: '0.10', volumeCount: 2 })
    const second = document({ id: 'b', nfeNumber: '101', nfeTotalValue: '0.20', volumeCount: 3 })
    const conference = buildTripConference({
      documents: [first, second],
      stops: [stop({ documents: [first, second] })],
    })

    expect(conference.summary.noteCount).toBe(2)
    expect(conference.summary.totalValue).toBe('0.30')
    expect(conference.summary.totalVolumes).toBe(5)
    expect(conference.summary.stopCount).toBe(1)
  })

  it('leva cliente, número, série e destino para a linha, na ordem das paradas', () => {
    const late = document({
      contact: { contractorName: null, name: 'Mercado Zeta', phone: null, taxId: '1' },
      id: 'late',
      nfeNumber: '9',
      nfeSeries: '1',
    })
    const early = document({ id: 'early', nfeNumber: '8' })
    const conference = buildTripConference({
      documents: [late, early],
      stops: [
        stop({ documents: [late], id: 's2', label: 'RUA B, 2, PIRASSUNUNGA, SP', sequence: 2 }),
        stop({ documents: [early], id: 's1', sequence: 1 }),
      ],
    })

    expect(conference.rows.map((row) => row.documentId)).toEqual(['early', 'late'])
    expect(conference.rows[1]).toMatchObject({
      clientName: 'Mercado Zeta',
      destinationLabel: 'RUA B, 2, PIRASSUNUNGA, SP',
      noteNumber: '9',
      noteSeries: '1',
    })
  })

  it('nota sem valor não vira R$ 0,00: é contada à parte', () => {
    const withValue = document({ id: 'a', nfeTotalValue: '50.00' })
    const withoutValue = document({ id: 'b' })
    const conference = buildTripConference({
      documents: [withValue, withoutValue],
      stops: [],
    })

    expect(conference.summary.totalValue).toBe('50.00')
    expect(conference.summary.notesWithoutValue).toBe(1)
    expect(conference.rows[1]?.totalValue).toBeNull()
  })

  it('nota sem parada entra no fim, sem destino', () => {
    const assigned = document({ id: 'a' })
    const loose = document({ id: 'b' })
    const conference = buildTripConference({
      documents: [assigned, loose],
      stops: [stop({ documents: [assigned] })],
    })

    expect(conference.rows.map((row) => row.documentId)).toEqual(['a', 'b'])
    expect(conference.rows[1]?.destinationLabel).toBe('')
    expect(conference.summary.stopCount).toBe(1)
  })
})
