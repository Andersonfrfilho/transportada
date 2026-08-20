/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  FreightRegionCodeTakenError,
  FreightRegionNotFoundError,
} from '../../src/freight-regions/domain/freight-region.error.js'
import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CREATE_REGION_BODY,
  createFreightRegionHttpFixture,
  FLEET_ONLY_PERMISSIONS,
  FREIGHT_REGIONS_PATH,
  jsonRequest,
  REGION,
  REGION_ID,
  responseApiError,
  responseData,
  UPDATE_REGION_BODY,
} from '../fixtures/freight-region-http.fixture'

const REGION_PATH = `${FREIGHT_REGIONS_PATH}/${REGION_ID}`

describe('freight regions http contract', () => {
  test('lists regions with the tenant context and the parsed filters', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${FREIGHT_REGIONS_PATH}?limit=10&cityContains=BARR&statusEq=active`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([{ ...REGION }])
    expect(fixture.listRegionCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: { cityContains: 'BARR', statusEq: 'active' },
        limit: 10,
      },
    ])
  })

  test('creates a region with cities and driver rates in the same body', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_REGION_BODY, method: 'POST', path: FREIGHT_REGIONS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toEqual({ ...REGION })
    expect(fixture.createRegionCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        region: { ...CREATE_REGION_BODY },
      },
    ])
  })

  test('replaces the region wholesale on update', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_REGION_BODY, method: 'PUT', path: REGION_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({ ...REGION, version: '2' })
    expect(fixture.updateRegionCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        expectedVersion: '1',
        region: { ...CREATE_REGION_BODY },
        regionId: REGION_ID,
        status: 'active',
      },
    ])
  })

  test('deletes the region and answers without a body', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'DELETE', path: REGION_PATH }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.deleteRegionCalls).toEqual([
      { context: COMPANY_CONTEXT, correlationId: CORRELATION_ID, regionId: REGION_ID },
    ])
  })

  test('answers 404 when the region is not this company’s', async () => {
    const fixture = await createFreightRegionHttpFixture({
      deleteRegionError: new FreightRegionNotFoundError(),
    })

    const response = await fixture.handle(jsonRequest({ method: 'DELETE', path: REGION_PATH }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('FREIGHT_REGION_NOT_FOUND')
  })

  test('carries the taken route code to the caller as a conflict', async () => {
    const fixture = await createFreightRegionHttpFixture({
      createRegionError: new FreightRegionCodeTakenError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_REGION_BODY, method: 'POST', path: FREIGHT_REGIONS_PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('FREIGHT_REGION_CODE_TAKEN')
  })
})

describe('freight regions http validation contract', () => {
  test('rejects a field the schema does not declare', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_REGION_BODY, zone: 3 },
        method: 'POST',
        path: FREIGHT_REGIONS_PATH,
      }),
    )

    // A zona sai do código impresso; aceitá-la digitada deixaria `1.002` nascer como zona 1
    expect(response.status).toBe(400)
    expect(fixture.createRegionCalls).toEqual([])
  })

  test('rejects a route code outside the printed form', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_REGION_BODY, code: '1.004' },
        method: 'POST',
        path: FREIGHT_REGIONS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createRegionCalls).toEqual([])
  })

  test('rejects the same city twice in the same region', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_REGION_BODY,
          cities: [
            { city: 'Barretos', state: 'SP' },
            { city: '  barretos ', state: 'sp' },
          ],
        },
        method: 'POST',
        path: FREIGHT_REGIONS_PATH,
      }),
    )

    // A unicidade é `(company, region, city, state)`: repetir aqui viraria 500 no banco
    expect(response.status).toBe(400)
    expect(fixture.createRegionCalls).toEqual([])
  })

  test('rejects two amounts for the same vehicle class', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_REGION_BODY,
          rates: [
            { driverAmount: '812.4500', freightClass: 'toco' },
            { driverAmount: '900.0000', freightClass: 'toco' },
          ],
        },
        method: 'POST',
        path: FREIGHT_REGIONS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createRegionCalls).toEqual([])
  })

  test('rejects an amount that is not money at four decimals', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_REGION_BODY,
          rates: [{ driverAmount: '1086.12', freightClass: 'truck' }],
        },
        method: 'POST',
        path: FREIGHT_REGIONS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createRegionCalls).toEqual([])
  })
})

describe('freight regions http authorization contract', () => {
  /**
   * A tela de cobertura do motorista vive sob `fleet.manage`. Pedir `settings.manage` para ler a
   * lista deixaria o campo de região em branco para o operador, que é justo quem cadastra motorista.
   */
  test('lets whoever manages the fleet read the table without rewriting it', async () => {
    const fixture = await createFreightRegionHttpFixture({ permissions: FLEET_ONLY_PERMISSIONS })

    const listed = await fixture.handle(
      jsonRequest({ method: 'GET', path: FREIGHT_REGIONS_PATH }),
    )
    const created = await fixture.handle(
      jsonRequest({ body: CREATE_REGION_BODY, method: 'POST', path: FREIGHT_REGIONS_PATH }),
    )
    const updated = await fixture.handle(
      jsonRequest({ body: UPDATE_REGION_BODY, method: 'PUT', path: REGION_PATH }),
    )
    const removed = await fixture.handle(jsonRequest({ method: 'DELETE', path: REGION_PATH }))

    expect(listed.status).toBe(200)
    expect(created.status).toBe(403)
    expect(updated.status).toBe(403)
    expect(removed.status).toBe(403)
    expect(fixture.createRegionCalls).toEqual([])
    expect(fixture.updateRegionCalls).toEqual([])
    expect(fixture.deleteRegionCalls).toEqual([])
  })
})
