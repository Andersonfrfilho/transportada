/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGooglePlacesGateway } from '../../src/geocoding-refine/infrastructure/google-places.gateway.js'

const REQUEST = {
  addressKey: '3527603|14210000|533',
  city: 'LUIS ANTONIO',
  cityCode: '3527603',
  district: 'CENTRO',
  number: '533',
  postalCode: '14210000',
  state: 'SP',
  street: 'R AMERICA DE ARAUJO PERES',
}

/** A resposta real da Places, medida em 2026-09-05 contra este mesmo endereço. */
const MEASURED_BODY = {
  places: [
    {
      addressComponents: [
        { longText: '533', types: ['street_number'] },
        { longText: 'Rua Américo de Araújo Píres', types: ['route'] },
        { longText: 'Centro', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { longText: 'Luís Antônio', types: ['administrative_area_level_2', 'political'] },
        { longText: 'São Paulo', types: ['administrative_area_level_1', 'political'] },
        { longText: 'Brazil', types: ['country', 'political'] },
        { longText: '14210-000', types: ['postal_code'] },
      ],
      id: 'ChIJXdwM7l43uJQRP_xrFvz7xh0',
      location: { latitude: -21.5534349, longitude: -47.7042824 },
    },
  ],
}

/** O `fetch` do Bun carrega `preconnect`, e o dublê precisa vestir o mesmo tipo. */
function transportOf(handler: (init?: RequestInit) => Promise<Response>): typeof fetch {
  return ((_input: unknown, init?: RequestInit) => handler(init)) as typeof fetch
}

function gatewayOf(response: Response) {
  return createGooglePlacesGateway({
    apiKey: 'chave',
    fetchImplementation: transportOf(() => Promise.resolve(response)),
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

describe('o gateway da Places (degrau 2b)', () => {
  /**
   * ⚠️ **O município no Brasil é `administrative_area_level_2`, não `locality`.** A primeira versão
   * pedia só `locality`, e o efeito não era erro: era a guarda de município **desligada em
   * silêncio** — `cityName` vazio, que a política trata como "o provedor não nomeou", que aceita.
   *
   * Guarda que falha aberta é pior que guarda nenhuma, porque ninguém procura por ela. Este teste
   * usa a resposta medida, em que `locality` **não existe**.
   */
  test('lê o município de uma resposta que não traz locality', async () => {
    const found = await gatewayOf(jsonResponse(MEASURED_BODY)).lookup(REQUEST)

    expect(found.cause).toBeNull()
    expect(found.place?.cityName).toBe('Luís Antônio')
    expect(found.place?.streetNumber).toBe('533')
    expect(found.place?.latitude).toBe('-21.5534349')
    expect(found.place?.longitude).toBe('-47.7042824')
    expect(found.place?.placeId).toBe('ChIJXdwM7l43uJQRP_xrFvz7xh0')
  })

  /** Rua inventada devolve lista vazia — a recusa que torna o degrau seguro (medido). */
  test('trata lista vazia como ausência, não como falha', async () => {
    const found = await gatewayOf(jsonResponse({ places: [] })).lookup(REQUEST)

    expect(found.cause).toBe('no_result')
  })

  /**
   * ⚠️ API desabilitada no projeto responde `PERMISSION_DENIED` com HTTP de erro. Isso **não** é
   * ausência de endereço: quem chama adia em vez de carimbar, e carimbar aqui queimaria a chance
   * paga única do endereço sem ter perguntado nada.
   */
  test('recusa do provedor adia, e nunca vira ausência de endereço', async () => {
    const found = await gatewayOf(
      jsonResponse({ error: { status: 'PERMISSION_DENIED' } }, 403),
    ).lookup(REQUEST)

    expect(found.cause).toBe('transport_error')
  })

  test('rede caída adia', async () => {
    const gateway = createGooglePlacesGateway({
      apiKey: 'chave',
      fetchImplementation: transportOf(() => Promise.reject(new Error('socket hang up'))),
    })

    expect((await gateway.lookup(REQUEST)).cause).toBe('transport_error')
  })

  /** Sem chave não se inventa chamada: a rotina responde e a app sobe igual. */
  test('sem chave, responde não configurado sem tocar a rede', async () => {
    let asked = 0
    const gateway = createGooglePlacesGateway({
      apiKey: '  ',
      fetchImplementation: transportOf(() => {
        asked += 1
        return Promise.resolve(jsonResponse(MEASURED_BODY))
      }),
    })

    expect((await gateway.lookup(REQUEST)).cause).toBe('not_configured')
    expect(asked).toBe(0)
  })

  /**
   * O texto vai **como a nota o escreveu**, erros inclusive: é a tolerância a eles que faz este
   * degrau existir, e corrigir aqui seria adivinhar.
   */
  test('manda o endereço da nota sem consertar a grafia', async () => {
    let sent = ''
    const gateway = createGooglePlacesGateway({
      apiKey: 'chave',
      fetchImplementation: transportOf((init) => {
        sent = String(init?.body ?? '')
        return Promise.resolve(jsonResponse(MEASURED_BODY))
      }),
    })

    await gateway.lookup(REQUEST)

    expect(sent).toContain('R AMERICA DE ARAUJO PERES, 533')
    /** Nome do destinatário não vai: o seam de endereço lê o lugar, nunca quem consome. */
    expect(sent).not.toContain('FERNANDES')
  })
})
