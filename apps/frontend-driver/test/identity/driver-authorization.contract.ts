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
  test('sem rede, a app segue autorizada em vez de travar', async () => {
    const result = await checkDriverAuthorization({
      apiBaseUrl: API_BASE_URL,
      fetch: mock(() => Promise.reject(new Error('network error'))),
      getAccessToken: () => Promise.resolve('access-token'),
    })

    expect(result).toBe('authorized')
  })
})
