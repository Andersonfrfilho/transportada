/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createExpensesClient,
  serializeFilters,
} from '@/modules/expenses/shared/expensesClient.service'

type Call = { body: string; method: string; url: string }

function clientWith(responses: readonly Response[]) {
  const calls: Call[] = []
  let index = 0
  const client = createExpensesClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      calls.push({ body: await request.clone().text(), method: request.method, url: request.url })
      const response = responses[index++]
      if (response === undefined) throw new Error('sem resposta de teste')
      return response
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  return { calls, client }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('expenses client', () => {
  it('serializa só os filtros preenchidos (a API recusa chave desconhecida)', () => {
    expect(serializeFilters({})).toBe('')
    expect(serializeFilters({ competence: '2026-11', status: 'open' })).toBe(
      'competence=2026-11&status=open',
    )
  })

  it('baixa e cancelamento vão para as rotas certas, sem o id no corpo', async () => {
    const occurrence = {
      competence: '2026-11',
      dueDate: '2026-11-05',
      expectedAmount: '10.00',
      expenseId: 'e',
      id: 'occ-1',
      paidAmount: '10.00',
      paidAt: '2026-11-05',
      paidBy: 'u',
      settlementNote: null,
      slot: 1,
      status: 'paid',
    }
    const { calls, client } = clientWith([json({ data: occurrence }), json({ data: occurrence })])
    await client.settleOccurrence({ id: 'occ-1', paidAmount: '10.00', paidAt: '2026-11-05' })
    await client.cancelOccurrence({ id: 'occ-1', reason: 'duplicada' })
    expect(calls[0]).toEqual({
      body: JSON.stringify({ paidAmount: '10.00', paidAt: '2026-11-05' }),
      method: 'POST',
      url: 'https://api.test/expense-occurrences/occ-1/settlement',
    })
    expect(calls[1]?.url).toBe('https://api.test/expense-occurrences/occ-1/cancellation')
  })

  it('remover viagem é DELETE e viagens disponíveis aceitam período', async () => {
    const result = {
      data: {
        items: [],
        occurrence: {
          competence: '2026-11',
          dueDate: '2026-11-05',
          expectedAmount: '10.00',
          expenseId: 'e',
          id: 'occ-1',
          paidAmount: null,
          paidAt: null,
          paidBy: null,
          settlementNote: null,
          slot: 1,
          status: 'open',
        },
        tripsTotal: '0.00',
      },
    }
    const { calls, client } = clientWith([
      json(result),
      json({ data: { available: [], pending: [], period: { from: 'a', to: 'b' } } }),
    ])
    await client.removeTrip({ occurrenceId: 'occ-1', tripId: 'trip-1' })
    await client.availableTrips({ from: '2026-10-01', occurrenceId: 'occ-1', to: '2026-10-31' })
    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.url).toBe('https://api.test/expense-occurrences/occ-1/trips/trip-1')
    expect(calls[1]?.url).toBe(
      'https://api.test/expense-occurrences/occ-1/available-trips?from=2026-10-01&to=2026-10-31',
    )
  })

  it('o código de erro da API sobe como veio', async () => {
    const { client } = clientWith([json({ error: { code: 'EXPENSE_TRIP_ALREADY_INCLUDED' } }, 409)])
    const failure = client.includeTrip({ occurrenceId: 'o', tripId: 't' })
    const error = await failure.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('EXPENSE_TRIP_ALREADY_INCLUDED')
  })
})
