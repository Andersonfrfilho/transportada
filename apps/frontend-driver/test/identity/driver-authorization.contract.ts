/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import { checkDriverAuthorization } from '../../src/modules/identity/shared/driverAuthorization.service'

const API_BASE_URL = 'http://localhost:53001'

describe('checkDriverAuthorization', () => {
  test('a conta de escritório (403 em trip.read) é reprovada', async () => {
    const result = await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.resolve(new Response(null, { status: 403 }))),
      getAccessToken: () => Promise.resolve('access-token'),
    })

    expect(result).toBe('forbidden')
  })

  test('conta de motorista (200) é autorizada', async () => {
    const result = await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.resolve(new Response(JSON.stringify({ data: null })))),
      getAccessToken: () => Promise.resolve('access-token'),
    })

    expect(result).toBe('authorized')
  })

  /**
   * Spec 189 T9.2 (B7): a checagem já leu `GET /me/trips/current` — o corpo vira o dado inicial da
   * tela, em vez de a consulta pedir a mesma coisa de novo logo em seguida.
   */
  test('o corpo da resposta autorizada volta para virar o dado inicial', async () => {
    const body = { data: { isRegisteredDriver: true, pendingProofs: [], trips: [] } }
    const payloads: unknown[] = []

    const result = await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.resolve(new Response(JSON.stringify(body)))),
      getAccessToken: () => Promise.resolve('access-token'),
      onAuthorizedPayload: (payload) => payloads.push(payload),
    })

    expect(result).toBe('authorized')
    expect(payloads).toEqual([body])
  })

  test('403 e corpo ilegível não entregam dado inicial nenhum', async () => {
    const payloads: unknown[] = []

    await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.resolve(new Response(null, { status: 403 }))),
      getAccessToken: () => Promise.resolve('access-token'),
      onAuthorizedPayload: (payload) => payloads.push(payload),
    })
    await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.resolve(new Response('<html>'))),
      getAccessToken: () => Promise.resolve('access-token'),
      onAuthorizedPayload: (payload) => payloads.push(payload),
    })

    expect(payloads).toEqual([])
  })

  test('a checagem manda o token e chama /me/trips/current', async () => {
    let received: Request | undefined
    const fetchSpy = mock((input: RequestInfo | URL): Promise<Response> => {
      received = input as Request
      return Promise.resolve(new Response(JSON.stringify({ data: null })))
    })

    await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: fetchSpy,
      getAccessToken: () => Promise.resolve('access-token'),
    })

    expect(received?.url).toBe(`${API_BASE_URL}/me/trips/current`)
    expect(received?.headers.get('authorization')).toBe('Bearer access-token')
  })

  /**
   * RF6 (boot sem rede) ainda não existe nesta app — sem resposta, a checagem não pode ser quem
   * derruba a tela. A Fase 3 troca este caminho pelo snapshot local.
   */
  /**
   * Spec 189 T9.2 (A3): sinal fraco não derruba a conexão — o `fetch` fica pendurado e o boot com
   * ele. A checagem tem prazo, e sem resposta no prazo a app segue autorizada.
   */
  test('a checagem que não responde no prazo é abortada e segue autorizada', async () => {
    const hangingFetch = (input: RequestInfo | URL): Promise<Response> =>
      new Promise((_resolve, reject) => {
        const signal = (input as Request).signal
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const startedAt = Date.now()

    const result = await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: hangingFetch,
      getAccessToken: () => Promise.resolve('access-token'),
      timeoutMs: 20,
    })

    expect(result).toBe('authorized')
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  test('sem rede, a app segue autorizada em vez de travar', async () => {
    const result = await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.reject(new Error('network error'))),
      getAccessToken: () => Promise.resolve('access-token'),
    })

    expect(result).toBe('authorized')
  })
})
