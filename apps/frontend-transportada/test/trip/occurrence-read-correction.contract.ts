/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { EMPTY_TRIP_OCCURRENCE_FILTERS } from '@/modules/trip/shared/tripOccurrenceFeed.service'
import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'

import { buildOccurrenceDetailFixture } from '../fixtures/tripOccurrenceDetail.fixture'

const API_URL = 'https://api.example.test'

const CANCELLATION = {
  cancelledAt: '2026-10-02T10:00:00.000Z',
  cancelledByName: 'Operador de teste',
  reason: 'Lançada na nota errada',
} as const

const CORRECTIONS = [
  {
    correctedAt: '2026-10-01T12:00:00.000Z',
    correctedByName: 'Operador de teste',
    previousItems: [{ code: '696', quantity: '1.000', unit: 'box' }],
  },
] as const

function createClient(payload: unknown) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(Response.json(payload)),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

function wire(extra: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...buildOccurrenceDetailFixture() }
  delete base.cancellation
  delete base.corrections
  return { ...base, ...extra }
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return undefined
}

describe('leituras publicam cancelamento e correções (spec 235 RF9, T2.1)', () => {
  test('o detalhe traz o cancelamento e as correções que a API publicou', async () => {
    const client = createClient({
      data: wire({ cancellation: CANCELLATION, corrections: CORRECTIONS }),
    })
    const detail = await client.readOccurrence({ occurrenceId: 'occurrence-1' })
    expect(detail.cancellation).toEqual(CANCELLATION)
    expect(detail.corrections).toEqual(CORRECTIONS)
  })

  test('API anterior, sem os campos: não cancelada e sem correções — nunca a resposta inválida', async () => {
    const client = createClient({ data: wire({}) })
    const detail = await client.readOccurrence({ occurrenceId: 'occurrence-1' })
    expect(detail.cancellation).toBeNull()
    expect(detail.corrections).toEqual([])
  })

  test('cancelamento malformado reprova a leitura em vez de virar "não cancelada"', async () => {
    const client = createClient({ data: wire({ cancellation: { reason: 'sem autor' } }) })
    const error = await readError(client.readOccurrence({ occurrenceId: 'occurrence-1' }))
    expect(error).toBeInstanceOf(Error)
  })

  test('correção malformada reprova a leitura', async () => {
    const client = createClient({
      data: wire({ corrections: [{ correctedAt: '2026-10-01T12:00:00.000Z' }] }),
    })
    const error = await readError(client.readOccurrence({ occurrenceId: 'occurrence-1' }))
    expect(error).toBeInstanceOf(Error)
  })

  test('o feed marca a cancelada e deixa as demais com cancellation nulo', async () => {
    const cancelled = { ...wire({ cancellation: CANCELLATION }), id: 'occurrence-2' }
    const active = wire({})
    const client = createClient({
      data: [cancelled, active],
      pagination: { nextCursor: null },
    })
    const page = await client.listOccurrences({
      cursor: null,
      filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
      order: 'desc',
      perPage: 25,
    })
    expect(page.items.map((item) => item.cancellation)).toEqual([CANCELLATION, null])
  })
})
