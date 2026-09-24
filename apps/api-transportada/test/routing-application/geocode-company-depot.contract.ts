/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 165 (bancada): a viagem de uma nota só nasce sem roteiro porque o barracão nunca chega a
 * `geocoded_addresses` — nenhum worker roda na bancada local para enfileirar a geocodificação, e
 * `readDepot` (`route-depot.query.ts`) devolve `not_geocoded`. Este contrato prova o caso de uso
 * que o seeder local usa para fechar essa lacuna com o centroide de município (spec 069).
 */
import { describe, expect, test } from 'bun:test'

import {
  geocodeCompanyDepot,
  type GeocodeCompanyDepotDependencies,
} from '../../src/routing/application/geocode-company-depot.use-case.js'
import type { GeocodedAddressRecord } from '../../src/routing/application/geocoding.port.js'
import type { MunicipalityCentroid } from '../../src/routing/application/municipality-centroid.port.js'

const ADDRESS_KEY = '3543402|14056680|1000'
const CITY_CODE = '3543402'

const RIBEIRAO_PRETO: MunicipalityCentroid = {
  cityCode: CITY_CODE,
  latitude: '-21.2138406',
  longitude: '-47.8218619',
  state: 'SP',
}

function createDependencies(input: {
  readonly centroid?: MunicipalityCentroid | null
  readonly existing?: GeocodedAddressRecord | null
}): GeocodeCompanyDepotDependencies & {
  readonly saveCalls: GeocodedAddressRecord[]
} {
  const saveCalls: GeocodedAddressRecord[] = []
  return {
    centroids: {
      async findByCityCode() {
        return input.centroid ?? null
      },
      async saveMany() {
        return 0
      },
    },
    geocodedAddresses: {
      async findByKeys() {
        return input.existing === undefined || input.existing === null ? [] : [input.existing]
      },
      async save(record) {
        saveCalls.push(record)
      },
    },
    saveCalls,
  }
}

describe('geocodifica o barracão com o centroide de município (spec 165)', () => {
  test('sem geocodificação prévia e com centroide disponível, grava source/precision "city"', async () => {
    const dependencies = createDependencies({ centroid: RIBEIRAO_PRETO })

    const result = await geocodeCompanyDepot(dependencies, {
      addressKey: ADDRESS_KEY,
      cityIbgeCode: CITY_CODE,
    })

    expect(result).toEqual({ status: 'geocoded' })
    expect(dependencies.saveCalls).toEqual([
      {
        addressKey: ADDRESS_KEY,
        externalPlaceId: '',
        latitude: RIBEIRAO_PRETO.latitude,
        longitude: RIBEIRAO_PRETO.longitude,
        precision: 'city',
        source: 'city',
      },
    ])
  })

  test('já geocodificado — inclusive fino, por um worker que rodou depois — nunca é sobrescrito', async () => {
    const existing: GeocodedAddressRecord = {
      addressKey: ADDRESS_KEY,
      externalPlaceId: 'place-123',
      latitude: '-21.1900000',
      longitude: '-47.8100000',
      precision: 'rooftop',
      source: 'google',
    }
    const dependencies = createDependencies({ centroid: RIBEIRAO_PRETO, existing })

    const result = await geocodeCompanyDepot(dependencies, {
      addressKey: ADDRESS_KEY,
      cityIbgeCode: CITY_CODE,
    })

    expect(result).toEqual({ status: 'already_geocoded' })
    expect(dependencies.saveCalls).toHaveLength(0)
  })

  test('sem o centroide do município na base, não inventa coordenada', async () => {
    const dependencies = createDependencies({ centroid: null })

    const result = await geocodeCompanyDepot(dependencies, {
      addressKey: ADDRESS_KEY,
      cityIbgeCode: CITY_CODE,
    })

    expect(result).toEqual({ status: 'centroid_missing' })
    expect(dependencies.saveCalls).toHaveLength(0)
  })
})
