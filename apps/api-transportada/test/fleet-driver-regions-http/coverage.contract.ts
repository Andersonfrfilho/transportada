/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CITY_REGION_ID,
  COVERAGE,
  COVERAGE_PATH,
  DRIVER_ID,
  FLEET_ONLY_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
  REPLACE_COVERAGE_BODY,
  createFleetDriverRegionHttpFixture,
} from '../fixtures/fleet-driver-region-http.fixture'
import {
  CORRELATION_ID,
  REGION_ID,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture'
import { FreightRegionUnknownError } from '../../src/freight-regions/domain/freight-region.error'
import { FleetDriverNotFoundError } from '../../src/fleet/domain/fleet.error'

describe('fleet driver regions http contract', () => {
  test('lists the coverage of one driver with zone and loose city in the same list', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: COVERAGE_PATH }))

    expect(response.status).toBe(200)
    expect(await responseData<readonly object[]>(response)).toEqual([
      {
        city: '',
        code: '1.000',
        name: 'Barretos',
        regionId: REGION_ID,
        scope: 'region',
        state: '',
        zone: 1,
      },
      {
        city: 'BARRINHA',
        code: '2.001',
        name: 'Ribeirão Preto',
        regionId: CITY_REGION_ID,
        scope: 'city',
        state: 'SP',
        zone: 2,
      },
    ])
    expect(fixture.listCoverageCalls).toEqual([
      { context: expect.objectContaining({ companyId: expect.any(String) }), driverId: DRIVER_ID },
    ])
  })

  test('replaces the whole coverage of the driver', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: REPLACE_COVERAGE_BODY, method: 'PUT', path: COVERAGE_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData<readonly object[]>(response)).toHaveLength(COVERAGE.length)
    expect(fixture.replaceCoverageCalls).toEqual([
      {
        context: expect.objectContaining({ companyId: expect.any(String) }),
        correlationId: CORRELATION_ID,
        driverId: DRIVER_ID,
        entries: [
          { city: '', regionId: REGION_ID, scope: 'region', state: '' },
          { city: 'Barrinha', regionId: CITY_REGION_ID, scope: 'city', state: 'SP' },
        ],
      },
    ])
  })

  // Motorista que deixou de rodar em qualquer rota é lista vazia, não rota ausente
  test('accepts an empty coverage', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { entries: [] }, method: 'PUT', path: COVERAGE_PATH }),
    )

    expect(response.status).toBe(200)
    expect(fixture.replaceCoverageCalls[0]).toMatchObject({ entries: [] })
  })

  test('answers 404 when the driver is not in this company', async () => {
    const fixture = await createFleetDriverRegionHttpFixture({
      replaceCoverageError: new FleetDriverNotFoundError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: REPLACE_COVERAGE_BODY, method: 'PUT', path: COVERAGE_PATH }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_NOT_FOUND')
  })

  test('answers 422 when a region belongs to another company', async () => {
    const fixture = await createFleetDriverRegionHttpFixture({
      replaceCoverageError: new FreightRegionUnknownError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: REPLACE_COVERAGE_BODY, method: 'PUT', path: COVERAGE_PATH }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('FREIGHT_REGION_UNKNOWN')
  })
})

describe('fleet driver regions http validation contract', () => {
  test('rejects a city coverage without the city', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { entries: [{ regionId: CITY_REGION_ID, scope: 'city', state: 'SP' }] },
        method: 'PUT',
        path: COVERAGE_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_REGION_CITY_REQUIRED')
    expect(fixture.replaceCoverageCalls).toEqual([])
  })

  test('rejects a city coverage without the state', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { entries: [{ city: 'Barrinha', regionId: CITY_REGION_ID, scope: 'city' }] },
        method: 'PUT',
        path: COVERAGE_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_REGION_CITY_REQUIRED')
    expect(fixture.replaceCoverageCalls).toEqual([])
  })

  // Zona com cidade é zona disfarçada: aceitar a cidade e apagá-la em silêncio é cobertura mentida
  test('rejects a zone coverage carrying a city', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          entries: [{ city: 'Barrinha', regionId: REGION_ID, scope: 'region', state: 'SP' }],
        },
        method: 'PUT',
        path: COVERAGE_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_REGION_CITY_UNEXPECTED')
    expect(fixture.replaceCoverageCalls).toEqual([])
  })

  test('rejects the same city twice in the same region', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          entries: [
            { city: 'Barrinha', regionId: CITY_REGION_ID, scope: 'city', state: 'SP' },
            { city: '  barrinha ', regionId: CITY_REGION_ID, scope: 'city', state: 'sp' },
          ],
        },
        method: 'PUT',
        path: COVERAGE_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.replaceCoverageCalls).toEqual([])
  })

  test('rejects an undeclared field in the entry', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { entries: [{ regionId: REGION_ID, scope: 'region', zone: 1 }] },
        method: 'PUT',
        path: COVERAGE_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.replaceCoverageCalls).toEqual([])
  })

  // O roteador só casa `:id` em uuid canônico: identificador torto nem chega ao caso de uso
  test('does not route a driver identifier that is not a uuid', async () => {
    const fixture = await createFleetDriverRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/fleet/drivers/not-a-uuid/regions' }),
    )

    expect(response.status).toBe(404)
    expect(fixture.listCoverageCalls).toEqual([])
  })
})

describe('fleet driver regions http authorization contract', () => {
  test('assigns coverage with the fleet permissions alone', async () => {
    const fixture = await createFleetDriverRegionHttpFixture({
      permissions: FLEET_ONLY_PERMISSIONS,
    })

    const response = await fixture.handle(
      jsonRequest({ body: REPLACE_COVERAGE_BODY, method: 'PUT', path: COVERAGE_PATH }),
    )

    expect(response.status).toBe(200)
  })

  test('reads with fleet.read but refuses to write without fleet.manage', async () => {
    const fixture = await createFleetDriverRegionHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
    })

    const read = await fixture.handle(jsonRequest({ method: 'GET', path: COVERAGE_PATH }))
    const write = await fixture.handle(
      jsonRequest({ body: REPLACE_COVERAGE_BODY, method: 'PUT', path: COVERAGE_PATH }),
    )

    expect(read.status).toBe(200)
    expect(write.status).toBe(403)
    expect(fixture.replaceCoverageCalls).toEqual([])
  })
})
