/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 D5/T2.3: `documents[].volumeCount` no detalhe da viagem — inteiro ou `null`, nunca `0`
 * no lugar de "desconhecido". Não é dinheiro nem dado pessoal: aparece sem `trip.financials`.
 */
import { describe, expect, test } from 'bun:test'

import type { ContractorDelivery } from '../../src/contractor-portal/application/contractor-portal.types.js'
import {
  jsonRequest,
  responseData,
  tripDetailPath,
  TRIP_DETAIL,
  TRIP_DOCUMENT_DETAIL,
} from '../fixtures/trip-http-payload.fixture'
import {
  createTripHttpFixture,
  FINANCIALS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/trip-http.fixture'

type DocumentBody = Record<string, unknown>

async function readDocuments(input: {
  readonly permissions: typeof FINANCIALS_PERMISSIONS
  readonly volumeCounts: readonly (null | number)[]
}): Promise<{
  readonly documents: readonly DocumentBody[]
  readonly stopDocuments: readonly DocumentBody[]
}> {
  const documents = input.volumeCounts.map((volumeCount, index) => ({
    ...TRIP_DOCUMENT_DETAIL,
    id: `00000000-0000-4000-8000-0000000007${String(index).padStart(2, '0')}`,
    volumeCount,
  }))
  const fixture = await createTripHttpFixture({
    getTripResult: {
      ...TRIP_DETAIL,
      documents,
      stops: [
        {
          addressKey: 'stop-address-key',
          arrivedAt: null,
          cityCode: '3550308',
          completedAt: null,
          deliveryWindowEnd: null,
          deliveryWindowStart: null,
          documents,
          id: '00000000-0000-4000-8000-000000000b01',
          label: 'Parada única',
          latitude: '-23.550520',
          longitude: '-46.633308',
          sequence: 1,
          state: 'SP',
        },
      ],
    },
    permissions: input.permissions,
  })
  const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
  expect(response.status).toBe(200)
  const data = (await responseData(response)) as unknown as {
    documents: DocumentBody[]
    stops: { documents: DocumentBody[] }[]
  }
  return { documents: data.documents, stopDocuments: data.stops[0]?.documents ?? [] }
}

describe('GET /trips/:id answers documents[].volumeCount (spec 233 T2.3)', () => {
  test('keeps a count, a zero and an unknown apart — null is never turned into 0', async () => {
    const { documents, stopDocuments } = await readDocuments({
      permissions: FINANCIALS_PERMISSIONS,
      volumeCounts: [12, 0, null],
    })

    expect(documents.map((document) => document.volumeCount)).toEqual([12, 0, null])
    expect(stopDocuments.map((document) => document.volumeCount)).toEqual([12, 0, null])
  })

  test('is classified as safe: it stays without trip.financials, key present', async () => {
    const { documents, stopDocuments } = await readDocuments({
      permissions: READ_ONLY_PERMISSIONS,
      volumeCounts: [12, null],
    })

    for (const document of [...documents, ...stopDocuments]) {
      expect(Object.hasOwn(document, 'volumeCount')).toBe(true)
      expect(Object.hasOwn(document, 'nfeTotalValue')).toBe(false)
    }
    expect(documents.map((document) => document.volumeCount)).toEqual([12, null])
  })

  test('does not reach the contractor portal: its delivery type has no volumeCount', () => {
    const portalDeliveryCarriesVolumeCount: 'volumeCount' extends keyof ContractorDelivery
      ? true
      : false = false

    expect(portalDeliveryCarriesVolumeCount).toBe(false)
  })
})
