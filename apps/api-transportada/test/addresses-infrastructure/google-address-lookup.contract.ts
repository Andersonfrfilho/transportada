/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createGoogleAddressLookupGateway } from '../../src/addresses/infrastructure/google-address-lookup.gateway.js'

const PEDIDO = {
  city: 'LUIS ANTONIO',
  cityCode: '3527256',
  district: '',
  number: '533',
  postalCode: '14210-000',
  state: 'SP',
  street: 'R AMERICA DE ARAUJO PERES',
}

function gateway(responder: (url: string) => unknown, ok = true) {
  const urls: string[] = []
  const port = createGoogleAddressLookupGateway({
    apiKey: 'chave',
    fetchImplementation: (async (url: string) => {
      urls.push(String(url))
      return { json: async () => responder(String(url)), ok }
    }) as unknown as typeof fetch,
  })

  return { port, urls }
}

const ROOFTOP = {
  results: [
    {
      address_components: [
        { long_name: '533', short_name: '533', types: ['street_number'] },
        { long_name: 'Rua Américo de Araújo Píres', short_name: 'R.', types: ['route'] },
        { long_name: 'São Paulo', short_name: 'SP', types: ['administrative_area_level_1'] },
        { long_name: '14210-010', short_name: '14210-010', types: ['postal_code'] },
      ],
      geometry: { location: { lat: -21.5534349, lng: -47.7042824 }, location_type: 'ROOFTOP' },
      place_id: 'ChIJexemplo',
    },
  ],
  status: 'OK',
}

describe('busca textual no provedor pago (spec 084, G5/RF12)', () => {
  /**
   * RF12: a consulta leva **UF, cidade, bairro, logradouro, número e CEP**. Medido em 2026-09-04: o
   * CEP **não melhora** a busca — ele viaja para que o que volta possa ser comparado com ele.
   */
  test('a consulta leva os seis campos do endereço', async () => {
    const { port, urls } = gateway(() => ROOFTOP)
    await port.lookup({ ...PEDIDO, district: 'Centro' })

    const endereco = new URL(urls[0] ?? '').searchParams.get('address') ?? ''
    for (const parte of ['R AMERICA DE ARAUJO PERES', '533', 'Centro', 'LUIS ANTONIO', 'SP']) {
      expect(endereco).toContain(parte)
    }
    expect(endereco).toContain('14210-000')
  })

  /**
   * ⚠️ **O defeito que este teste impede.** O gateway do degrau 2 filtra por
   * `components=postal_code:…`, e ali está certo: ele quer a coordenada mais fina daquele CEP. Aqui
   * seria fatal — o filtro **obriga** o provedor a concordar com o nosso CEP, e a divergência de CEP
   * é justamente o achado de maior valor do relatório (ele devolve o endereço ao degrau 1, que é
   * grátis). Filtrar por CEP seria apagar o sinal antes de medi-lo.
   */
  test('não filtra por CEP — é o CEP que se quer ver divergir', async () => {
    const { port, urls } = gateway(() => ROOFTOP)
    await port.lookup(PEDIDO)

    const components = new URL(urls[0] ?? '').searchParams.get('components') ?? ''
    expect(components).not.toContain('postal_code')
    expect(components).toContain('country:BR')
    /** A UF entra: ela é nossa e confiável, e impede "Rua 7 de Setembro" de outro estado. */
    expect(components).toContain('SP')
  })

  test('devolve o nível, o lugar e o endereço que o provedor conhece', async () => {
    const { port } = gateway(() => ROOFTOP)
    const lido = await port.lookup(PEDIDO)

    expect(lido).toEqual({
      address: {
        cityName: '',
        district: '',
        number: '533',
        postalCode: '14210-010',
        state: 'SP',
        street: 'Rua Américo de Araújo Píres',
      },
      latitude: '-21.5534349',
      longitude: '-47.7042824',
      matchLevel: 'rooftop',
      placeId: 'ChIJexemplo',
    })
  })

  /**
   * ⚠️ **O caso medido em Luis Antonio**: o texto da nota não existe para o provedor, e ele devolve
   * o município. Isso é **resultado**, não falha — e é a linha mais acionável do relatório, porque
   * nenhuma correção de coordenada conserta um logradouro que não existe.
   */
  test('sem resultado nenhum o nível é not_found, e continua sendo resultado', async () => {
    const { port } = gateway(() => ({ results: [], status: 'ZERO_RESULTS' }))
    const lido = await port.lookup(PEDIDO)

    expect(lido?.matchLevel).toBe('not_found')
    expect(lido?.latitude).toBeNull()
    expect(lido?.placeId).toBe('')
  })

  /**
   * ⚠️ **"Não achou" e "não consegui perguntar" são coisas diferentes, e confundi-las corromperia a
   * medição inteira.** Rede fora do ar gravada como `not_found` diria que o provedor não conhece o
   * endereço — e o relatório mandaria o contratante corrigir um cadastro que está certo. Falha de
   * chamada é `null`: o lote pula a linha e tenta de novo depois.
   */
  test('falha de chamada é null, nunca not_found', async () => {
    const { port: caiu } = gateway(() => ROOFTOP, false)
    expect(await caiu.lookup(PEDIDO)).toBeNull()

    const { port: explodiu } = gateway(() => {
      throw new Error('rede')
    })
    expect(await explodiu.lookup(PEDIDO)).toBeNull()

    const { port: recusou } = gateway(() => ({ status: 'OVER_QUERY_LIMIT' }))
    expect(await recusou.lookup(PEDIDO)).toBeNull()
  })

  /**
   * RNF1: nada do endereço vai para log, nem a chave da API para a URL de erro. Aqui a garantia é
   * estrutural — o gateway não tem logger para onde escrever.
   */
  test('o gateway não tem para onde registrar o endereço', () => {
    const fonte = readFileSync(
      new URL(
        '../../src/addresses/infrastructure/google-address-lookup.gateway.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(fonte).not.toContain('logger')
    expect(fonte).not.toContain('console.')
  })
})
