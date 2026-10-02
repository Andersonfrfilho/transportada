/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 T5.1 (D7): o filtro por nota é conferido contra a empresa **e a viagem** do contexto antes
 * de o leitor rodar — nota de outra empresa ou de outra viagem responde 404 `TRIP_DOCUMENT_NOT_FOUND`,
 * nunca lista vazia que confirme a existência, e a recusa de localização continua valendo.
 */
import { describe, expect, test } from 'bun:test'

import { createReadTripTimelineUseCase } from '../../src/trips/application/read-trip-timeline.use-case.js'
import type { ReadTripTimelineResult } from '../../src/trips/application/trip-timeline.types.js'
import { TripDocumentNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000101'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'

const EMPTY_RESULT: ReadTripTimelineResult = { items: [], nextCursor: null }

function createDoubles(options: { readonly documentExists: boolean }) {
  const documentScopeCalls: unknown[] = []
  const readerCalls: unknown[] = []
  const useCase = createReadTripTimelineUseCase({
    existence: {
      findTripCompanyScope: async () => ({ id: TRIP_ID }),
      findTripDocumentScope: async (input) => {
        documentScopeCalls.push(input)
        return options.documentExists ? { id: DOCUMENT_ID } : null
      },
    },
    reader: {
      listTripTimeline: async (input) => {
        readerCalls.push(input)
        return EMPTY_RESULT
      },
    },
  })
  return { documentScopeCalls, readerCalls, useCase }
}

describe('createReadTripTimelineUseCase com documentId (spec 227 T5.1)', () => {
  test('nota que não é desta viagem e desta empresa: 404 sem chamar o leitor', async () => {
    const { documentScopeCalls, readerCalls, useCase } = createDoubles({ documentExists: false })

    await expect(
      useCase.execute({
        canReadEventLocation: true,
        context: { companyId: COMPANY_ID },
        cursor: null,
        documentId: DOCUMENT_ID,
        limit: 100,
        tripId: TRIP_ID,
      }),
    ).rejects.toBeInstanceOf(TripDocumentNotFoundError)
    expect(documentScopeCalls).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_ID, tripId: TRIP_ID },
    ])
    expect(readerCalls).toEqual([])
  })

  test('nota da viagem: o leitor recebe o documentId e o cursor', async () => {
    const { readerCalls, useCase } = createDoubles({ documentExists: true })
    const cursor = { id: TRIP_ID, kindPriority: 0, occurredAt: '2026-09-18T00:00:00.000000Z' }

    await useCase.execute({
      canReadEventLocation: true,
      context: { companyId: COMPANY_ID },
      cursor,
      documentId: DOCUMENT_ID,
      limit: 37,
      tripId: TRIP_ID,
    })

    expect(readerCalls).toEqual([
      { companyId: COMPANY_ID, cursor, documentId: DOCUMENT_ID, limit: 37, tripId: TRIP_ID },
    ])
  })

  test('sem o filtro: a nota nem é consultada e o leitor não recebe documentId', async () => {
    const { documentScopeCalls, readerCalls, useCase } = createDoubles({ documentExists: false })

    await useCase.execute({
      canReadEventLocation: true,
      context: { companyId: COMPANY_ID },
      cursor: null,
      limit: 100,
      tripId: TRIP_ID,
    })

    expect(documentScopeCalls).toEqual([])
    expect(readerCalls.map((call) => 'documentId' in (call as object))).toEqual([false])
  })

  test('sem trip.event-location, a posição sai nula mesmo com o filtro', async () => {
    const item = {
      actorName: null,
      channel: null,
      closeReason: null,
      document: { id: DOCUMENT_ID, number: '1', series: '1' },
      fromStatus: null,
      id: TRIP_ID,
      kind: 'document.delivered',
      lateRegistration: false,
      location: {
        accuracyMeters: 5,
        capturedAt: '2026-09-18T00:00:00.000Z',
        distanceMeters: 10,
        latitude: -23.5,
        longitude: -46.6,
      },
      locationState: 'captured',
      occurrence: null,
      occurredAt: '2026-09-18T00:00:00.000Z',
      onBehalfOfDriverName: null,
      recordedAt: null,
      returnReason: null,
      stop: null,
      toStatus: null,
    } as const
    const useCase = createReadTripTimelineUseCase({
      existence: {
        findTripCompanyScope: async () => ({ id: TRIP_ID }),
        findTripDocumentScope: async () => ({ id: DOCUMENT_ID }),
      },
      reader: { listTripTimeline: async () => ({ items: [item], nextCursor: null }) },
    })

    const result = await useCase.execute({
      canReadEventLocation: false,
      context: { companyId: COMPANY_ID },
      cursor: null,
      documentId: DOCUMENT_ID,
      limit: 100,
      tripId: TRIP_ID,
    })

    expect(result.items.map((entry) => entry.location)).toEqual([null])
    expect(result.items.map((entry) => entry.locationState)).toEqual(['captured'])
  })
})
