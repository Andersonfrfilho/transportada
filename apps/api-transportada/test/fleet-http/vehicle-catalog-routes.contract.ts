/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFleetCatalogHttpFixture } from '../fixtures/fleet-catalog-http.fixture.js'
import { jsonRequest, responseData } from '../fixtures/fleet-http-payload.fixture.js'
import { READ_ONLY_PERMISSIONS } from '../fixtures/fleet-http.fixture.js'

const BRANDS_PATH = '/fleet/vehicle-catalog/brands'
const MODELS_PATH = '/fleet/vehicle-catalog/models'

describe('fleet vehicle catalog http contract', () => {
  test('lists brands for a traction vehicle with fleet.read alone', async () => {
    const fixture = await createFleetCatalogHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${BRANDS_PATH}?role=traction&vehicleType=truck` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({
      items: [{ code: '102', name: 'AGRALE' }],
      source: 'fipe',
    })
    expect(fixture.listBrandsCalls).toEqual([{ role: 'traction', vehicleType: 'truck' }])
  })

  test('rejects a caller without fleet.read', async () => {
    const fixture = await createFleetCatalogHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${BRANDS_PATH}?role=traction&vehicleType=truck` }),
    )

    expect(response.status).toBe(403)
    expect(fixture.listBrandsCalls).toEqual([])
  })

  test('lists models for a brand code alongside role and vehicle type', async () => {
    const fixture = await createFleetCatalogHttpFixture({
      result: { items: [{ label: 'UNO', value: '5986' }], source: 'fipe' },
    })

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${MODELS_PATH}?role=traction&vehicleType=van&brand=102`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({
      items: [{ code: '5986', name: 'UNO' }],
      source: 'fipe',
    })
    expect(fixture.listModelsCalls).toEqual([
      { brand: '102', role: 'traction', vehicleType: 'van' },
    ])
  })

  // Tipo é opcional só para o trailer — sem cobertura de catálogo, o motivo é o próprio `source`
  test('answers an empty list with a reason for a trailer, which has no catalog coverage', async () => {
    const fixture = await createFleetCatalogHttpFixture({
      result: { items: [], source: 'none' },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${BRANDS_PATH}?role=trailer&vehicleType=` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({ items: [], source: 'none' })
  })

  // O provedor externo cai, mas quem preenche o formulário não pode ver um 5xx por isso
  test('answers 200 with a degraded source instead of failing when the provider is down', async () => {
    const fixture = await createFleetCatalogHttpFixture({
      result: { items: [], source: 'unavailable' },
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${BRANDS_PATH}?role=traction&vehicleType=truck` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({ items: [], source: 'unavailable' })
  })
})
