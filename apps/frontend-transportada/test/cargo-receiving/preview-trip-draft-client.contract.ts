/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2: o cliente dos rascunhos de viagem lê `GET /cargo-previews/:id/trip-drafts`, sem query e sem
 * corpo — a empresa é do contexto da API —, e nunca escreve nada: criar viagem não passa por aqui.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoPreviewClient } from '@/modules/cargo-receiving/shared/cargoPreviewClient.service'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { PREVIEW_ID } from '../fixtures/cargoPreview.fixture'
import { DEFAULT_TRIP_DRAFTS } from '../fixtures/cargoPreviewTripDraft.fixture'

type Captured = { body: string; headers: Headers; method: string; url: URL }

function harness(respond: () => Response) {
  const calls: Captured[] = []
  const client = createCargoPreviewClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      calls.push({
        body: await request.clone().text(),
        headers: request.headers,
        method: request.method,
        url: new URL(request.url),
      })
      return respond()
    },
    getAccessToken: () => Promise.resolve('token-sintetico'),
  })
  return { calls, client }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

describe('o cliente dos rascunhos de viagem (spec 237 T5.2)', () => {
  test('GET no caminho da prévia, sem query, sem corpo e com o token', async () => {
    const { calls, client } = harness(() => json({ data: DEFAULT_TRIP_DRAFTS }))

    const drafts = await client.getTripDrafts(PREVIEW_ID)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url.pathname).toBe(`/cargo-previews/${PREVIEW_ID}/trip-drafts`)
    expect(calls[0]?.url.search).toBe('')
    expect(calls[0]?.body).toBe('')
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
    expect(drafts.routes).toHaveLength(5)
  })

  test('o id vai codificado no caminho', async () => {
    const { calls, client } = harness(() => json({ data: DEFAULT_TRIP_DRAFTS }))

    await client.getTripDrafts('a/b c')

    expect(calls[0]?.url.pathname).toBe('/cargo-previews/a%2Fb%20c/trip-drafts')
  })

  test('a prévia que não existe chega como o código da API, sem inventar mensagem', async () => {
    const { client } = harness(() =>
      json({ error: { code: 'CARGO_PREVIEW_NOT_FOUND', message: 'não achei' } }, 404),
    )

    const failure = await client.getTripDrafts(PREVIEW_ID).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(CargoReceivingRequestError)
    expect((failure as CargoReceivingRequestError).message).toBe('CARGO_PREVIEW_NOT_FOUND')
  })

  test('resposta fora do formato é recusada inteira', async () => {
    const { client } = harness(() => json({ data: { ...DEFAULT_TRIP_DRAFTS, extra: true } }))

    const failure = await client.getTripDrafts(PREVIEW_ID).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect((failure as CargoReceivingRequestError).message).toBe('RESPONSE_INVALID')
  })
})
