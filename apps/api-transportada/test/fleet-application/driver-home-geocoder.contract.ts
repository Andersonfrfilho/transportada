/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createDriverHomeGeocoder,
  type DriverHomeCoordinate,
  type DriverHomeRepositoryPort,
} from '../../src/fleet/application/driver-home-geocoder.port.js'
import type { DriverHomeState } from '../../src/fleet/domain/driver-home-geocoding.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const ALVO = { companyId: COMPANY_ID, driverId: DRIVER_ID }

const CASA: DriverHomeState = {
  city: 'Sertãozinho',
  geocodedAt: null,
  latitude: null,
  longitude: null,
  number: '2043',
  postalCode: '14170480',
  state: 'SP',
  street: 'Rua Antônio Fagundes',
}

function ambiente(input: {
  readonly home: DriverHomeState | null
  readonly search?: (term: string) => Promise<DriverHomeCoordinate | null>
}) {
  const termos: string[] = []
  const escritas: (DriverHomeCoordinate | null)[] = []
  const repository: DriverHomeRepositoryPort = {
    readHome: async () => input.home,
    writeHome: async (write) => {
      escritas.push(write.coordinate)
    },
  }
  const provider = {
    search: async (term: string) => {
      termos.push(term)
      return input.search === undefined ? null : input.search(term)
    },
  }
  return { escritas, geocoder: createDriverHomeGeocoder({ provider, repository }), termos }
}

describe('preencher a coordenada da casa uma vez (spec 097 D6)', () => {
  test('busca e grava quando a ficha ainda não foi procurada', async () => {
    const coordenada = { latitude: '-21.1372345', longitude: '-47.9901234' }
    const { escritas, geocoder, termos } = ambiente({ home: CASA, search: async () => coordenada })

    await geocoder.fill(ALVO)

    expect(termos).toEqual(['Rua Antônio Fagundes, 2043, Sertãozinho, SP, 14170480'])
    expect(escritas).toEqual([coordenada])
  })

  /**
   * ⚠️ **Grava mesmo sem achar.** É a gravação que carimba a marca de "já procurei" — sem ela, o
   * motorista cujo endereço o provedor não encontra dispararia uma busca a cada salvamento, para
   * sempre, e nada falharia para denunciar.
   */
  test('grava a ausência quando o provedor não acha nada', async () => {
    const { escritas, geocoder, termos } = ambiente({ home: CASA, search: async () => null })

    await geocoder.fill(ALVO)

    expect(termos).toHaveLength(1)
    expect(escritas).toEqual([null])
  })

  /** A segunda metade da regra: procurou uma vez, não procura mais. */
  test('não chama o provedor quando a ficha já foi procurada', async () => {
    const { escritas, geocoder, termos } = ambiente({
      home: { ...CASA, geocodedAt: new Date('2026-09-08T12:00:00Z') },
    })

    await geocoder.fill(ALVO)

    expect(termos).toEqual([])
    expect(escritas).toEqual([])
  })

  /** Endereço incompleto não vira busca, e não vira gravação: não há o que carimbar. */
  test('não chama o provedor com endereço incompleto', async () => {
    const { escritas, geocoder, termos } = ambiente({ home: { ...CASA, street: '' } })

    await geocoder.fill(ALVO)

    expect(termos).toEqual([])
    expect(escritas).toEqual([])
  })

  /**
   * ⚠️ **Provedor fora do ar não carimba a marca.** Rede caída não é resposta, e gravar aqui
   * condenaria a ficha a nunca mais tentar por causa de um timeout. O erro sobe, e quem chama
   * decide — no salvamento do cadastro, ele é engolido para não derrubar o cadastro.
   */
  test('falha do provedor não grava nada', async () => {
    const { escritas, geocoder } = ambiente({
      home: CASA,
      search: async () => {
        throw new Error('ECONNRESET')
      },
    })

    await expect(geocoder.fill(ALVO)).rejects.toThrow('ECONNRESET')
    expect(escritas).toEqual([])
  })

  /** Ficha que não existe na empresa do contexto é ausência, nunca busca. */
  test('não busca para motorista que o contexto não alcança', async () => {
    const { escritas, geocoder, termos } = ambiente({ home: null })

    await geocoder.fill(ALVO)

    expect(termos).toEqual([])
    expect(escritas).toEqual([])
  })
})
