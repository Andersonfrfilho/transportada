/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T710 (ponta solta da T707 — achado H3 da revisão final): sem `trip.financials` a API
 * redige `amounts.documentsTotal`/`amounts.revenueTotal` de `GET /trips` — as chaves **somem** do
 * corpo, nunca viram `null`/zero. `isAbsentOrTripAmounts` ainda exigia as três chaves sempre
 * presentes (`hasExactKeys` sobre `TRIP_AMOUNTS_KEYS`), então a resposta redigida reprovava
 * inteira e a listagem quebrava — o mesmo defeito do achado C1/T701 na nota fiscal.
 */
import { describe, expect, test } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { TRIP } from './trip.fixture'

const adapters = createTripResponseAdapters()

function tripComAmounts(amounts: Record<string, unknown>): Record<string, unknown> {
  return { ...TRIP, amounts }
}

describe('dinheiro da viagem sem trip.financials na listagem (spec 153 T710)', () => {
  test('sem documentsTotal nem revenueTotal, a viagem continua válida e as duas somem', () => {
    const trip = adapters.tripFromApi(
      tripComAmounts({ revenueSource: 'estimated' }),
    ) as unknown as { amounts?: Record<string, unknown> }

    expect(trip.amounts).toBeDefined()
    expect(Object.hasOwn(trip.amounts as object, 'documentsTotal')).toBe(false)
    expect(Object.hasOwn(trip.amounts as object, 'revenueTotal')).toBe(false)
    expect(trip.amounts?.revenueSource).toBe('estimated')
  })

  test('com trip.financials, as duas continuam chegando como antes', () => {
    const trip = adapters.tripFromApi(
      tripComAmounts({
        documentsTotal: '1000.0000',
        revenueSource: 'measured',
        revenueTotal: '100.0000',
      }),
    ) as unknown as { amounts?: Record<string, unknown> }

    expect(trip.amounts?.documentsTotal).toBe('1000.0000')
    expect(trip.amounts?.revenueTotal).toBe('100.0000')
  })

  test('presente com forma errada continua reprovando: redação não vira licença para lixo', () => {
    expect(() => adapters.tripFromApi(tripComAmounts({ revenueSource: 'not-a-source' }))).toThrow()
    expect(() =>
      adapters.tripFromApi(tripComAmounts({ documentsTotal: 42, revenueSource: 'measured' })),
    ).toThrow()
  })

  test('a listagem (GET /trips) aceita a mesma forma redigida', () => {
    const page = adapters.tripListFromApi({
      data: [tripComAmounts({ revenueSource: 'period' })],
      page: { nextCursor: null },
    })

    const [trip] = page.items
    expect(trip?.amounts?.revenueSource).toBe('period')
    expect(Object.hasOwn(trip?.amounts as object, 'documentsTotal')).toBe(false)
  })
})
