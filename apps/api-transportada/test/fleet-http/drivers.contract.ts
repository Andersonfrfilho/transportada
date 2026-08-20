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
  LINKED_COMPANY_TAX_ID,
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

  // Autônomo fatura pelo próprio CNPJ, mas o condutor do MDF-e continua sendo o CPF
  test('accepts the linked company tax id beside the mandatory cpf', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, linkedTaxId: LINKED_COMPANY_TAX_ID },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createDriverCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driver: { ...CREATE_DRIVER_BODY, linkedTaxId: LINKED_COMPANY_TAX_ID },
      },
    ])
  })

  test('rejects a linked tax id that is not a plain fourteen digit cnpj', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, linkedTaxId: CREATE_DRIVER_BODY.taxId },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createDriverCalls).toEqual([])
  })

  // Endereço parcial é cadastro em andamento, não erro: só a forma de cada campo é cobrada
  test('accepts a partially filled address and both optional dates', async () => {
    const fixture = await createFleetHttpFixture()
    const driver = {
      ...CREATE_DRIVER_BODY,
      address: { ...CREATE_DRIVER_BODY.address, city: 'Campinas', postalCode: '13010000' },
      birthDate: '1984-03-12',
      licenseExpiresAt: '2030-09-30',
    }

    const response = await fixture.handle(
      jsonRequest({ body: driver, method: 'POST', path: FLEET_DRIVERS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createDriverCalls).toEqual([
      { context: COMPANY_CONTEXT, correlationId: 'fleet-http-correlation', driver },
    ])
  })

  test('rejects a postal code with a mask and a state that is not a two letter code', async () => {
    const fixture = await createFleetHttpFixture()
    const bodies = [
      {
        ...CREATE_DRIVER_BODY,
        address: { ...CREATE_DRIVER_BODY.address, postalCode: '13010-000' },
      },
      { ...CREATE_DRIVER_BODY, address: { ...CREATE_DRIVER_BODY.address, state: 'Sao Paulo' } },
    ]

    for (const body of bodies) {
      const response = await fixture.handle(
        jsonRequest({ body, method: 'POST', path: FLEET_DRIVERS_PATH }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    }
    expect(fixture.createDriverCalls).toEqual([])
  })

  // Nascer amanhã é erro de digitação; validade de CNH no futuro é o caso normal
  test('refuses a birth date in the future but keeps a future license expiry', async () => {
    const fixture = await createFleetHttpFixture()

    const refused = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, birthDate: '2999-01-01' },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )
    const accepted = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, licenseExpiresAt: '2999-01-01' },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(refused.status).toBe(400)
    expect(accepted.status).toBe(201)
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
