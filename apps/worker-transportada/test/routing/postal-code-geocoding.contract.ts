/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createBrasilApiPostalCodeGateway } from '../../src/routing/infrastructure/brasil-api-postal-code.gateway.js'
import type { GeocodeAddressRequest } from '../../src/routing/application/geocoding.port.js'

const BASE_URL = 'https://brasilapi.com.br/api/cep/v2'

function requestFor(postalCode: string, number = '1000'): GeocodeAddressRequest {
  return {
    addressKey: `3550308|${postalCode}|${number}`,
    city: 'Sao Paulo',
    cityCode: '3550308',
    district: 'Bela Vista',
    number,
    postalCode,
    state: 'SP',
    street: 'Avenida Paulista',
  }
}

/**
 * Corpos **medidos** contra a BrasilAPI em 2026-09-01 (adendo da ADR-0044). Não são invenção: a
 * forma do `location` e a ausência de `street` no CEP geral são o que a spec 069 afirma, e um
 * fixture inventado provaria o que nós achamos em vez do que o provedor faz.
 *
 * ⚠️ E isso não é retórica: a primeira versão deste arquivo trazia `ibge.city` de Sales Oliveira
 * como `3545803`, que **não é** o código dela — é o de outra cidade, a 230 km. O campo não é lido
 * pelo gateway, então nenhum teste ficaria vermelho; ele só foi pego porque o seed de centroides da
 * T007 comparou o código com a malha do IBGE. Campo inventado dentro de fixture "medido" é a mentira
 * que sobrevive à suíte inteira.
 */
const AVENIDA_PAULISTA = {
  cep: '01310100',
  city: 'São Paulo',
  ibge: { city: '3550308', state: '35' },
  location: {
    coordinates: { latitude: '-23.5617698', longitude: '-46.6553299' },
    type: 'Point',
  },
  neighborhood: 'Bela Vista',
  service: 'open-cep',
  state: 'SP',
  street: 'Avenida Paulista',
  timezoneName: 'America/Sao_Paulo',
}

/** Sales Oliveira, onze mil habitantes: um CEP para o município inteiro, e `street` nulo. */
const CEP_GERAL_DE_CIDADE_PEQUENA = {
  cep: '14660000',
  city: 'Sales Oliveira',
  ibge: { city: '3544905', state: '35' },
  location: {
    coordinates: { latitude: '-20.77194', longitude: '-47.83806' },
    type: 'Point',
  },
  neighborhood: null,
  service: 'open-cep',
  state: 'SP',
  street: null,
  timezoneName: 'America/Sao_Paulo',
}

function respondWith(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status,
    })) as unknown as typeof fetch
}

describe('BrasilAPI postal code geocoding (spec 069, degrau 1)', () => {
  test('reads the coordinate the response already carries', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: respondWith(AVENIDA_PAULISTA),
    })

    expect(await gateway.geocode(requestFor('01310100'))).toEqual({
      cause: null,
      coordinate: {
        externalPlaceId: '',
        latitude: '-23.5617698',
        longitude: '-46.6553299',
        precision: 'postal_code',
        source: 'postal_code',
      },
    })
  })

  /**
   * RF9, e é o teste que impede o defeito mais caro desta fase. Cidade pequena tem **um CEP para o
   * município inteiro**: a coordenada dele é palpite de quilômetros, e gravada como `postal_code`
   * ela passaria no portão de coordenada fina (`precision !== 'city'`) e entraria **dentro** da
   * rota. É a família de defeito da ADR-0044 §1 — número plausível, sem aviso.
   */
  test('marks a whole-municipality postal code as city precision', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: respondWith(CEP_GERAL_DE_CIDADE_PEQUENA),
    })

    const resolved = await gateway.geocode(requestFor('14660000', 'S/N'))

    expect(resolved.coordinate?.precision).toBe('city')
    expect(resolved.coordinate?.source).toBe('city')
  })

  /**
   * O discriminador é o `street`, **não o sufixo `-000`**: a Avenida Presidente Vargas de Araraquara
   * é `14801-000` e é logradouro. Casar pelo sufixo a classificaria como palpite de município.
   */
  test('does not treat a -000 suffix as a whole-municipality postal code', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: respondWith({
        ...AVENIDA_PAULISTA,
        cep: '14801000',
        city: 'Araraquara',
        ibge: { city: '3503208', state: '35' },
        street: 'Avenida Presidente Vargas',
      }),
    })

    expect((await gateway.geocode(requestFor('14801000'))).coordinate?.precision).toBe(
      'postal_code',
    )
  })

  /**
   * `location` é opcional: o `/cep/v2` responde por vários serviços a montante e nem todos devolvem
   * coordenada. Ausência é degrau que não resolve — quem chama desce a cascata, e ninguém inventa
   * coordenada para não devolver vazio.
   */
  test('returns null when the response carries no coordinate', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: respondWith({ ...AVENIDA_PAULISTA, location: undefined }),
    })

    /** Coordenada ausente tem causa própria: o corpo veio, o provedor a montante é que não a trouxe. */
    expect(await gateway.geocode(requestFor('01310100'))).toEqual({
      cause: 'no_coordinate',
      coordinate: null,
    })
  })

  test('returns null when the provider does not know the postal code', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: respondWith(
        { message: 'Todos os serviços de CEP retornaram erro.' },
        404,
      ),
    })

    expect(await gateway.geocode(requestFor('99999999'))).toEqual({
      cause: 'not_found',
      coordinate: null,
    })
  })

  /** Serviço público e gratuito: 429 é recusa esperada, não defeito nosso — desce a cascata. */
  test('returns null when the provider rate limits', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: respondWith({ message: 'rate limited' }, 429),
    })

    expect((await gateway.geocode(requestFor('01310100'))).cause).toBe('not_found')
  })

  test('never throws when the transport fails', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: (async () => {
        throw new Error('network down')
      }) as unknown as typeof fetch,
    })

    /** Transporte que morre é causa **própria**: confundi-la com CEP inexistente esconderia egresso
     * bloqueado, que é exatamente a dúvida que staging não conseguiu responder. */
    expect(await gateway.geocode(requestFor('01310100'))).toEqual({
      cause: 'transport_error',
      coordinate: null,
    })
  })

  test('never asks the provider when the base URL is empty', async () => {
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: '',
      fetchImplementation: (() => {
        throw new Error('não deveria chamar')
      }) as unknown as typeof fetch,
    })

    expect(await gateway.geocode(requestFor('01310100'))).toEqual({
      cause: 'not_configured',
      coordinate: null,
    })
  })

  test('asks for the canonical postal code, digits only', async () => {
    const seen: string[] = []
    const gateway = createBrasilApiPostalCodeGateway({
      baseUrl: BASE_URL,
      fetchImplementation: (async (input: string | URL) => {
        seen.push(String(input))

        return new Response(JSON.stringify(AVENIDA_PAULISTA), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }) as unknown as typeof fetch,
    })

    await gateway.geocode({ ...requestFor('01310100'), postalCode: '01310-100' })

    expect(seen).toEqual([`${BASE_URL}/01310100`])
  })
})
