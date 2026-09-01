/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGoogleGeocodingGateway } from '../../src/routing/infrastructure/google-geocoding.gateway.js'
import type { GeocodeAddressRequest } from '../../src/routing/application/geocoding.port.js'

const REQUEST: GeocodeAddressRequest = {
  addressKey: '3550308|01310100|1000',
  city: 'São Paulo',
  cityCode: '3550308',
  district: 'Bela Vista',
  number: '1000',
  postalCode: '01310100',
  state: 'SP',
  street: 'Avenida Paulista',
}

function respondWith(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status,
    })) as unknown as typeof fetch
}

function okResult(locationType: string, placeId = 'ChIJ0WGkg4FEzpQR') {
  return {
    results: [
      {
        geometry: {
          location: { lat: -23.5617698, lng: -46.6553299 },
          location_type: locationType,
        },
        place_id: placeId,
      },
    ],
    status: 'OK',
  }
}

/** Sem a chave, e não com ela `undefined`: passar `undefined` a um parâmetro com default usa o default. */
function resultWithoutPlaceId() {
  return {
    results: [
      { geometry: { location: { lat: -23.5617698, lng: -46.6553299 }, location_type: 'ROOFTOP' } },
    ],
    status: 'OK',
  }
}

/**
 * ⚠️ **CA5: o fake é de transporte, nunca a porta.** Foi injetando `GeocodingPort` que a T006 da
 * spec 058 ficou verde sem que o adaptador existisse — duas verificações passando sobre uma camada
 * ausente. Aqui o `fetch` é dublado e o adaptador **real** roda por cima dele.
 */
describe('Google geocoding gateway (spec 069, degrau 2)', () => {
  test.each([
    ['ROOFTOP', 'rooftop'],
    ['RANGE_INTERPOLATED', 'street'],
    ['GEOMETRIC_CENTER', 'postal_code'],
    ['APPROXIMATE', 'city'],
  ])('maps %s to %s', async (locationType, precision) => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: respondWith(okResult(locationType)),
    })

    expect((await gateway.geocode(REQUEST))?.precision).toBe(precision)
  })

  /**
   * ADR-0044 §3, mitigação 1: o `place_id` é armazenável indefinidamente **sem exceção nenhuma**, e
   * é a saída barata se um dia for preciso ficar dentro dos termos. Mitigação que falha em silêncio
   * não é mitigação — o CHECK do banco cobra, e aqui o adaptador é cobrado.
   */
  test('always persists the place id', async () => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: respondWith(okResult('ROOFTOP', 'place-abc')),
    })

    expect(await gateway.geocode(REQUEST)).toMatchObject({
      externalPlaceId: 'place-abc',
      source: 'google',
    })
  })

  /** Sem `place_id` o CHECK da tabela recusaria a linha: melhor não resolver que gravar quebrado. */
  test('refuses a result that carries no place id', async () => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: respondWith(resultWithoutPlaceId()),
    })

    expect(await gateway.geocode(REQUEST)).toBeNull()
  })

  /** `ZERO_RESULTS` é resposta legítima, não erro: o provedor simplesmente não achou o endereço. */
  test('returns null on ZERO_RESULTS', async () => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: respondWith({ results: [], status: 'ZERO_RESULTS' }),
    })

    expect(await gateway.geocode(REQUEST)).toBeNull()
  })

  test('returns null when the provider rate limits', async () => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: respondWith({ status: 'OVER_QUERY_LIMIT' }),
    })

    expect(await gateway.geocode(REQUEST)).toBeNull()
  })

  test('returns null when the transport fails', async () => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: (async () => {
        throw new Error('network down')
      }) as unknown as typeof fetch,
    })

    expect(await gateway.geocode(REQUEST)).toBeNull()
  })

  /** `location_type` novo entra como `city`: o desconhecido é o palpite mais grosseiro, nunca o fino. */
  test('treats an unknown location type as a municipality guess', async () => {
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'key',
      fetchImplementation: respondWith(okResult('SOMETHING_NEW')),
    })

    expect((await gateway.geocode(REQUEST))?.precision).toBe('city')
  })

  test('sends the address and the key to the geocoding endpoint', async () => {
    const seen: string[] = []
    const gateway = createGoogleGeocodingGateway({
      apiKey: 'secret-key',
      fetchImplementation: (async (input: string | URL) => {
        seen.push(String(input))

        return new Response(JSON.stringify(okResult('ROOFTOP')), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }) as unknown as typeof fetch,
    })

    await gateway.geocode(REQUEST)

    expect(seen[0]).toContain('key=secret-key')
    /** `URLSearchParams` codifica espaço como `+`, não `%20` — é a forma que o provedor recebe. */
    expect(seen[0]).toContain('Avenida+Paulista')
    expect(seen[0]).toContain('01310100')
  })
})
