/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 P1: receita lançada na viagem — mesma trilha do gasto (autor, hora), viagem de outra
 * empresa devolve 404. Espelha `test/trip-financial/list-costs.contract.ts`.
 */
import { describe, expect, it } from 'bun:test'

import {
  listTripRevenues,
  type TripRevenueEntryView,
  type TripRevenueListPort,
} from '../../src/trips/application/list-trip-revenues.use-case.js'
import { TripNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'

function entry(overrides: Partial<TripRevenueEntryView> = {}): TripRevenueEntryView {
  return {
    actor: { name: 'Ana Souza', userId: crypto.randomUUID() },
    amount: '120.0000',
    createdAt: '2026-08-05T09:00:00.000Z',
    description: 'Ajuda de carga',
    entryKind: { id: crypto.randomUUID(), name: 'Ajuda de carga' },
    id: crypto.randomUUID(),
    ...overrides,
  }
}

function buildRepository(entries: readonly TripRevenueEntryView[] | null): TripRevenueListPort {
  return { listByTrip: () => Promise.resolve(entries) }
}

function list(repository: TripRevenueListPort) {
  return listTripRevenues({ companyId: COMPANY_ID, repository, tripId: TRIP_ID })
}

describe('os lançamentos de receita da viagem, com o autor (spec 169 P1)', () => {
  it('devolve os lançamentos como o repositório entregou: espécie, amount, description, createdAt, actor', async () => {
    const entries = [entry(), entry({ description: 'Taxa de reentrega' })]

    const result = await list(buildRepository(entries))

    expect(result).toEqual(entries)
  })

  it('viagem de outra empresa não é encontrada — 404, nunca 403', async () => {
    const attempt = list(buildRepository(null))

    await expect(attempt).rejects.toBeInstanceOf(TripNotFoundError)
  })
})
