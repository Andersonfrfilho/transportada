/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { toOutcome } from '@/modules/driver-trip/hooks/useDriverTrip.hook'
import {
  createDriverTripClient,
  DriverTripRequestError,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '@/modules/driver-trip/shared/driverTrip.types'

const RETRYABLE_STATUSES = [408, 429, 502, 503, 504] as const
const REFUSAL_STATUSES = [400, 403, 404, 409, 422, 500] as const

const ARRIVAL: DriverFieldReport = {
  idempotencyKey: 'chave-1',
  kind: 'arrive',
  location: null,
  stopId: 'stop-1',
}

async function outcomeOf(response: Response): Promise<string> {
  const client = createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: () => Promise.resolve(response),
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  try {
    await client.send(ARRIVAL)
    return 'sent'
  } catch (error) {
    return toOutcome(error).kind
  }
}

/**
 * O legado `/minha-viagem` é o aplicativo que o campo usa enquanto `VITE_DRIVER_APP_URL` estiver
 * desligado, e tinha o mesmo defeito do app novo: todo não-OK virava `rejected`, inclusive o HTML
 * de um 502 de deploy. Espelha `apps/frontend-driver/test/driver-trip/retryable-status.contract.ts`.
 */
describe('indisponibilidade do servidor não recusa o item da fila (legado)', () => {
  it.each([...RETRYABLE_STATUSES])('o %d com corpo JSON deixa o item na fila', async (status) => {
    const body = { error: { code: 'UPSTREAM', message: 'indisponível' } }

    expect(await outcomeOf(Response.json(body, { status }))).toBe('failed-network')
  })

  it.each([...RETRYABLE_STATUSES])('o %d com corpo HTML deixa o item na fila', async (status) => {
    const html = new Response('<html><body>Bad Gateway</body></html>', {
      headers: { 'content-type': 'text/html' },
      status,
    })

    expect(await outcomeOf(html)).toBe('failed-network')
  })

  it.each([...REFUSAL_STATUSES])('o %d continua sendo recusa do item', async (status) => {
    const body = { error: { code: 'TRIP_DOCUMENT_ALREADY_CLOSED', message: 'x' } }

    expect(await outcomeOf(Response.json(body, { status }))).toBe('rejected')
  })

  it('um 200 com corpo ilegível continua recusado, sem status na causa', async () => {
    const outcome = toOutcome(
      await createDriverTripClient({
        apiUrl: 'https://api.test',
        fetch: () => Promise.resolve(new Response('<html>ok?</html>', { status: 200 })),
        getAccessToken: () => Promise.resolve('token-de-mentira'),
      })
        .send(ARRIVAL)
        .catch((caught: unknown) => caught),
    )

    expect(outcome).toEqual({ cause: 'RESPONSE_INVALID', kind: 'rejected' })
  })

  it('a rede caída continua esperando', () => {
    const error = new DriverTripRequestError({ code: 'OFFLINE', isOffline: true })

    expect(toOutcome(error)).toEqual({ kind: 'failed-network' })
  })
})
