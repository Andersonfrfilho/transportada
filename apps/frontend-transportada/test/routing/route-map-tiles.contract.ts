/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ROUTE_MAP_TILES_PATH,
  resolveRouteMapTiles,
} from '../../src/modules/routing/shared/routeMapTiles.service'

const API_BASE_URL = 'https://api.example.test'

function respondWith(status: number): typeof fetch {
  return (() => Promise.resolve(new Response(null, { status }))) as unknown as typeof fetch
}

describe('route map tiles (ADR-0044 §6)', () => {
  /**
   * O caminho é relativo à origem da API, que o `connect-src` já declara. Uma URL absoluta de host
   * de tile seria apanhada pelo contrato de CSP — e o motivo da ADR-0047, que esta feature **não**
   * revoga, é justamente não mandar coordenada de cliente para servidor alheio.
   */
  test('resolves against our own API origin, never a third-party tile host', async () => {
    const availability = await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: respondWith(206),
    })

    expect(availability).toEqual({ available: true, url: `${API_BASE_URL}${ROUTE_MAP_TILES_PATH}` })
  })

  test('tolerates a base url with a trailing slash instead of doubling it', async () => {
    const availability = await resolveRouteMapTiles({
      apiBaseUrl: `${API_BASE_URL}/`,
      fetchImplementation: respondWith(200),
    })

    expect(availability).toEqual({ available: true, url: `${API_BASE_URL}${ROUTE_MAP_TILES_PATH}` })
  })

  /**
   * Aceite da spec 058: o painel **degrada para a lista sem mapa e diz isso**. O arquivo é gerado
   * offline do mesmo extract do OSRM, e num ambiente novo ainda não foi — o que é comportamento
   * declarado, não defeito.
   */
  test('degrades when the tile file was never generated for this environment', async () => {
    const availability = await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: respondWith(404),
    })

    expect(availability).toEqual({ available: false, reason: 'missing' })
  })

  test('degrades when the request itself cannot be made', async () => {
    const availability = await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    })

    expect(availability).toEqual({ available: false, reason: 'missing' })
  })

  /** Máquina sem WebGL não desenha mapa vetorial — e a lista é a resposta certa, não um erro. */
  test('degrades without asking for the file when the browser cannot draw it', async () => {
    let requested = false
    const availability = await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: (() => {
        requested = true
        return Promise.resolve(new Response(null, { status: 200 }))
      }) as unknown as typeof fetch,
      supportsWebGl: false,
    })

    expect(availability).toEqual({ available: false, reason: 'unsupported' })
    expect(requested).toBe(false)
  })

  /**
   * A tela diz **qual** motivo. "Não foi possível carregar o mapa" sem causa transforma uma
   * degradação prevista em defeito aparente, e manda o operador abrir chamado para o esperado.
   */
  test('always names the reason, so a declared degradation never reads as a bug', async () => {
    const missing = await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: respondWith(404),
    })
    const unsupported = await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: respondWith(200),
      supportsWebGl: false,
    })

    expect(missing.available).toBe(false)
    expect(unsupported.available).toBe(false)
    expect(missing.available === false && missing.reason).not.toBe(
      unsupported.available === false && unsupported.reason,
    )
  })

  /** Pedir um byte responde "existe?" sem baixar centenas de MB para descobrir que sim. */
  test('asks for a single byte instead of downloading the whole archive', async () => {
    let sentRange = ''
    await resolveRouteMapTiles({
      apiBaseUrl: API_BASE_URL,
      fetchImplementation: ((_url: string, init: RequestInit) => {
        sentRange = new Headers(init.headers).get('range') ?? ''
        return Promise.resolve(new Response(null, { status: 206 }))
      }) as unknown as typeof fetch,
    })

    expect(sentRange).toBe('bytes=0-0')
  })
})
