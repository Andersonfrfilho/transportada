/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  geocodeAddresses,
  type GeocodeAddressesDependencies,
  type GeocodingHotCache,
} from '../../src/routing/application/geocode-address.use-case.js'
import type {
  GeocodeAddressRequest,
  GeocodedAddressRecord,
} from '../../src/routing/application/geocoding.port.js'

const ADDRESS_KEY = '3550308|01310100|1000'

const REQUEST: GeocodeAddressRequest = {
  addressKey: ADDRESS_KEY,
  city: 'Sao Paulo',
  cityCode: '3550308',
  district: 'Bela Vista',
  number: '1000',
  postalCode: '01310100',
  state: 'SP',
  street: 'Avenida Paulista',
}

const ROOFTOP: GeocodedAddressRecord = {
  addressKey: ADDRESS_KEY,
  externalPlaceId: 'ChIJplaceid',
  latitude: '-23.5613090',
  longitude: '-46.6564870',
  precision: 'rooftop',
  source: 'google',
}

function buildDependencies(
  overrides: Partial<GeocodeAddressesDependencies> = {},
): GeocodeAddressesDependencies & { readonly geocodeCalls: string[] } {
  const geocodeCalls: string[] = []
  return {
    centroids: {
      byCityCode: () => Promise.resolve(null),
    },
    geocodeCalls,
    geocoding: {
      geocode: (request) => {
        geocodeCalls.push(request.addressKey)
        return Promise.resolve({
          externalPlaceId: ROOFTOP.externalPlaceId,
          latitude: ROOFTOP.latitude,
          longitude: ROOFTOP.longitude,
          precision: ROOFTOP.precision,
          source: ROOFTOP.source,
        })
      },
    },
    repository: {
      findByKeys: () => Promise.resolve([]),
      save: () => Promise.resolve(),
    },
    ...overrides,
  }
}

function buildHotCache(): GeocodingHotCache & {
  readonly entries: Map<string, GeocodedAddressRecord>
} {
  const entries = new Map<string, GeocodedAddressRecord>()
  return {
    entries,
    get: (addressKey) => entries.get(addressKey),
    set: (record) => {
      entries.set(record.addressKey, record)
    },
  }
}

describe('geocode addresses (ADR-0044 §3)', () => {
  test('geocodes an address the base has never seen, and persists it', async () => {
    const saved: GeocodedAddressRecord[] = []
    const dependencies = buildDependencies({
      repository: {
        findByKeys: () => Promise.resolve([]),
        save: (record) => {
          saved.push(record)
          return Promise.resolve()
        },
      },
    })

    const result = await geocodeAddresses(dependencies, [REQUEST])

    expect(result.byAddressKey.get(ADDRESS_KEY)?.precision).toBe('rooftop')
    expect(saved).toHaveLength(1)
    expect(result.geocodedCount).toBe(1)
  })

  /** Endereço já visto nunca é geocodificado de novo — a mesma loja recebe cem vezes por ano. */
  test('never calls the provider for an address already in the base', async () => {
    const dependencies = buildDependencies({
      repository: {
        findByKeys: () => Promise.resolve([ROOFTOP]),
        save: () => Promise.resolve(),
      },
    })

    const result = await geocodeAddresses(dependencies, [REQUEST])

    expect(dependencies.geocodeCalls).toHaveLength(0)
    expect(result.geocodedCount).toBe(0)
    expect(result.byAddressKey.get(ADDRESS_KEY)).toEqual(ROOFTOP)
  })

  /**
   * Aceite da spec 058: **esvaziar o cache quente não dispara geocodificação nova.** É a definição
   * de a camada de baixo ser a autoritativa — perder o Redis não pode custar uma segunda rodada
   * paga, e é o que garante que ela sobrevive ao redeploy.
   */
  test('survives the hot cache being emptied without paying for geocoding again', async () => {
    const cache = buildHotCache()
    const dependencies = buildDependencies({
      cache,
      repository: {
        findByKeys: () => Promise.resolve([ROOFTOP]),
        save: () => Promise.resolve(),
      },
    })

    await geocodeAddresses(dependencies, [REQUEST])
    expect(cache.entries.size).toBe(1)

    cache.entries.clear()
    await geocodeAddresses(dependencies, [REQUEST])

    expect(dependencies.geocodeCalls).toHaveLength(0)
  })

  /**
   * Queda do geocodificador não derruba a sugestão: os novos descem a cascata até o município — e um
   * município entra marcado, fora da otimização, em vez de virar palpite disfarçado de parada.
   */
  test('falls down the cascade when the provider is unreachable, never inventing a rooftop', async () => {
    const dependencies = buildDependencies({
      centroids: {
        byCityCode: () =>
          Promise.resolve({
            externalPlaceId: '',
            latitude: '-23.5505200',
            longitude: '-46.6333090',
            precision: 'city',
            source: 'city',
          }),
      },
      geocoding: { geocode: () => Promise.reject(new Error('provider down')) },
    })

    const result = await geocodeAddresses(dependencies, [REQUEST])

    expect(result.byAddressKey.get(ADDRESS_KEY)?.precision).toBe('city')
    // Centroide não é endereço geocodificado: ele não conta na métrica de custo
    expect(result.geocodedCount).toBe(0)
  })

  test('leaves an address the whole cascade could not resolve out of the result', async () => {
    const dependencies = buildDependencies({
      geocoding: { geocode: () => Promise.resolve(null) },
    })

    const result = await geocodeAddresses(dependencies, [REQUEST])

    expect(result.byAddressKey.has(ADDRESS_KEY)).toBe(false)
  })
})
