/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createPhotonDriverHomeGateway } from '../../src/fleet/infrastructure/photon-driver-home.gateway.js'

function gateway(payload: unknown, status = 200) {
  const urls: string[] = []
  return {
    port: createPhotonDriverHomeGateway({
      baseUrl: 'https://photon.example/api',
      fetch: (async (url: URL) => {
        urls.push(String(url))
        return new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
          status,
        })
      }) as unknown as typeof fetch,
    }),
    urls,
  }
}

function feature(city: string, coordinates: unknown): unknown {
  return {
    features: [{ geometry: { coordinates }, properties: { city }, type: 'Feature' }],
    type: 'FeatureCollection',
  }
}

describe('a coordenada da casa vinda do Photon (spec 097 D6)', () => {
  test('devolve a coordenada quando a cidade bate', async () => {
    const { port } = gateway(feature('Ribeirão Preto', [-47.8103, -21.1775]))

    expect(await port.search('Rua X, 1, Ribeirão Preto, SP', 'Ribeirão Preto')).toEqual({
      latitude: '-21.1775',
      longitude: '-47.8103',
    })
  })

  /**
   * ⚠️ **O caso medido em 2026-09-08, contra o Photon real.** "Rua Sete de Setembro, 990, Pontal,
   * SP" voltou como `-23.468, -46.527` — Guarulhos, a 250 km de Pontal. O nome da rua existe em
   * quase toda cidade do Brasil e o provedor casa a mais famosa; a coordenada é plausível, o número
   * não tem nada de errado, e a casa do motorista iria parar na Grande São Paulo.
   *
   * Cidade divergente é **ausência**, nunca a coordenada de outro lugar.
   */
  test('recusa a coordenada quando o provedor casou outra cidade', async () => {
    const { port } = gateway(feature('Guarulhos', [-46.5273, -23.4684]))

    expect(await port.search('Rua Sete de Setembro, 990, Pontal, SP', 'Pontal')).toBeNull()
  })

  /** O cadastro escreve `Sertãozinho`, o provedor devolve `Sertaozinho`: é a mesma cidade. */
  test('a comparação ignora acento e caixa', async () => {
    const { port } = gateway(feature('SERTAOZINHO', [-47.99, -21.13]))

    expect(await port.search('Rua Y, 2, Sertãozinho, SP', 'Sertãozinho')).not.toBeNull()
  })

  /**
   * ⚠️ Coordenada fora da caixa do Brasil continental é descartada — é onde a troca de
   * `[longitude, latitude]` aparece: os mesmos números invertidos caem no Oceano Índico.
   */
  test('recusa coordenada fora do Brasil', async () => {
    const { port } = gateway(feature('Ribeirão Preto', [-21.1775, -47.8103]))

    expect(await port.search('Rua X, 1, Ribeirão Preto, SP', 'Ribeirão Preto')).toBeNull()
  })

  /** Resposta vazia é ausência — medido: o Photon não acha o endereço de um dos seis motoristas. */
  test('lista vazia é ausência', async () => {
    const { port } = gateway({ features: [], type: 'FeatureCollection' })

    expect(await port.search('Rua Z, 3, Sertãozinho, SP', 'Sertãozinho')).toBeNull()
  })

  /** Provedor com defeito é ausência, nunca exceção: o cadastro não pode cair por causa dele. */
  test('resposta de erro é ausência', async () => {
    const { port } = gateway({}, 503)

    expect(await port.search('Rua X, 1, Ribeirão Preto, SP', 'Ribeirão Preto')).toBeNull()
  })

  /** O termo e o limite viajam na consulta: uma resposta é o que basta. */
  test('pede um resultado só, com o termo montado', async () => {
    const { port, urls } = gateway(feature('Ribeirão Preto', [-47.8103, -21.1775]))
    await port.search('Rua X, 1, Ribeirão Preto, SP', 'Ribeirão Preto')

    expect(urls[0]).toContain('limit=1')
    expect(urls[0]).toContain('q=Rua+X')
  })
})
