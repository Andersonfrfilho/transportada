/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CREATE_DRIVER_BODY,
  DRIVER,
  DRIVER_ID,
  FLEET_DRIVERS_PATH,
  jsonRequest,
  MEMBERSHIP_ID,
  responseApiError,
  responseData,
  UPDATE_DRIVER_BODY,
} from '../fixtures/fleet-http-payload.fixture'
import { COMPANY_CONTEXT, createFleetHttpFixture } from '../fixtures/fleet-http.fixture'

const DRIVER_PATH = `${FLEET_DRIVERS_PATH}/${DRIVER_ID}`

describe('fleet drivers http contract', () => {
  test('lists drivers inside the paging envelope', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${FLEET_DRIVERS_PATH}?nameContains=Silva` }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ ...DRIVER }], page: { nextCursor: null } })
    expect(fixture.listDriverCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: { nameContains: 'Silva' },
        limit: 25,
      },
    ])
  })

  // Motorista sem login roda o MDF-e inteiro — o vínculo com identidade é opcional
  test('creates a driver without a login link', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_DRIVER_BODY, method: 'POST', path: FLEET_DRIVERS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(
      (await responseData<{ readonly membershipId: string | null }>(response)).membershipId,
    ).toBeNull()
    expect(fixture.createDriverCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driver: { ...CREATE_DRIVER_BODY },
      },
    ])
  })

  test('rejects a tax id that is not a plain eleven digit cpf', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, taxId: '123.456.789-01' },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createDriverCalls).toEqual([])
  })

  test('links the driver to a membership on update and forwards the expected version', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_DRIVER_BODY, method: 'PATCH', path: DRIVER_PATH }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateDriverCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driver: { ...CREATE_DRIVER_BODY, membershipId: MEMBERSHIP_ID },
        driverId: DRIVER_ID,
        expectedVersion: '1',
        status: 'active',
      },
    ])
  })

  test('propagates a membership that does not belong to the company as 422', async () => {
    const fixture = await createFleetHttpFixture({
      createDriverError: new ApiError({
        code: 'FLEET_DRIVER_MEMBERSHIP_NOT_FOUND',
        message: 'Membership not found for this company',
        status: 422,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, membershipId: MEMBERSHIP_ID },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_MEMBERSHIP_NOT_FOUND')
  })
})
