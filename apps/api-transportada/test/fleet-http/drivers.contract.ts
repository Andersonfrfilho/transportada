/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CREATE_DRIVER_BODY,
  DRIVER,
  DRIVER_AVAILABILITY,
  DRIVER_FIELDS,
  DRIVER_ID,
  DRIVER_INPUT,
  FLEET_DRIVERS_PATH,
  jsonRequest,
  LINKED_COMPANY_TAX_ID,
  MEMBERSHIP_ID,
  responseApiError,
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

  // O perfil sai do corpo antes da aplicação: ele nomeia o papel do usuário, não campo da ficha
  test('splits the profile from the driver fields on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, profile: 'aggregate' },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createDriverCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driver: { ...DRIVER_FIELDS },
        profile: 'aggregate',
      },
    ])
  })

  // O vínculo nasce com o usuário que a criação abre: digitá-lo aqui é campo desconhecido
  test('refuses a membership and a missing profile on create', async () => {
    const fixture = await createFleetHttpFixture()
    const bodies = [
      { ...CREATE_DRIVER_BODY, membershipId: MEMBERSHIP_ID },
      { ...DRIVER_FIELDS },
      { ...CREATE_DRIVER_BODY, profile: 'operator' },
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
        driver: { ...DRIVER_FIELDS, linkedTaxId: LINKED_COMPANY_TAX_ID },
        profile: CREATE_DRIVER_BODY.profile,
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
      ...DRIVER_FIELDS,
      address: { ...DRIVER_FIELDS.address, city: 'Campinas', postalCode: '13010000' },
      birthDate: '1984-03-12',
      licenseExpiresAt: '2030-09-30',
    }

    const response = await fixture.handle(
      jsonRequest({
        body: { ...driver, profile: CREATE_DRIVER_BODY.profile },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createDriverCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driver,
        profile: CREATE_DRIVER_BODY.profile,
      },
    ])
  })

  // Nacionalidade, naturalidade, filiação e local de emissão são opcionais: em branco é ausência
  test('carries the personal fields of the licence and accepts them empty', async () => {
    const fixture = await createFleetHttpFixture()
    const driver = {
      ...DRIVER_FIELDS,
      birthCity: 'Barrinha',
      birthState: 'SP',
      fatherName: 'Antonio da Silva',
      licenseIssuedCity: 'Ribeirao Preto',
      licenseIssuedState: 'SP',
      motherName: 'Maria dos Santos',
      nationality: 'Brasileira',
    }
    const blank = {
      ...DRIVER_FIELDS,
      birthCity: '',
      birthState: '',
      fatherName: '',
      licenseIssuedCity: '',
      licenseIssuedState: '',
      motherName: '',
      nationality: '',
    }

    for (const body of [driver, blank]) {
      const response = await fixture.handle(
        jsonRequest({
          body: { ...body, profile: CREATE_DRIVER_BODY.profile },
          method: 'POST',
          path: FLEET_DRIVERS_PATH,
        }),
      )

      expect(response.status).toBe(201)
    }
    expect(fixture.createDriverCalls.map((call) => call.driver)).toEqual([driver, blank])
  })

  // A UF da naturalidade e a do DETRAN emissor são sigla, como a do endereço
  test('rejects a birth state and a licence state spelled out', async () => {
    const fixture = await createFleetHttpFixture()
    const bodies = [
      { ...CREATE_DRIVER_BODY, birthState: 'Sao Paulo' },
      { ...CREATE_DRIVER_BODY, licenseIssuedState: 'Sao Paulo' },
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

    // A primeira habilitação já aconteceu: no futuro ela é digitação errada, como o nascimento
    const refusedFirstLicense = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, firstLicenseAt: '2999-01-01' },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(refused.status).toBe(400)
    expect(refusedFirstLicense.status).toBe(400)
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
        driver: { ...DRIVER_INPUT, membershipId: MEMBERSHIP_ID },
        driverId: DRIVER_ID,
        expectedVersion: '1',
        status: 'active',
      },
    ])
  })

  // O usuário do motorista precisa de um canal para receber o código: sem ele, nada é escrito
  test('propagates a driver without any contact as 422', async () => {
    const fixture = await createFleetHttpFixture({
      createDriverError: new ApiError({
        code: 'FLEET_DRIVER_CONTACT_REQUIRED',
        message: 'Driver needs an e-mail or a phone to receive the invitation',
        status: 422,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_DRIVER_BODY, email: '', phone: '' },
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_CONTACT_REQUIRED')
  })

  /**
   * A conferência prévia do formulário: ela responde por campo, para o operador ver a colisão no
   * campo em vez de descobri-la depois de preencher a ficha inteira.
   */
  test('answers the availability of each unique field', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${FLEET_DRIVERS_PATH}/availability?taxId=${DRIVER_FIELDS.taxId}&licenseNumber=${DRIVER_FIELDS.licenseNumber}&email=${encodeURIComponent(DRIVER_FIELDS.email)}&driverId=${DRIVER_ID}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { ...DRIVER_AVAILABILITY } })
    expect(fixture.driverAvailabilityCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverId: DRIVER_ID,
        email: DRIVER_FIELDS.email,
        licenseNumber: DRIVER_FIELDS.licenseNumber,
        taxId: DRIVER_FIELDS.taxId,
      },
    ])
  })

  // Campo em branco é ausência: o formulário consulta enquanto se digita, e nem todo campo está pronto
  test('accepts the availability query with no field at all', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${FLEET_DRIVERS_PATH}/availability` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.driverAvailabilityCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverId: null,
        email: '',
        licenseNumber: '',
        taxId: '',
      },
    ])
  })

  test('refuses a malformed field and an unknown key on the availability query', async () => {
    const fixture = await createFleetHttpFixture()
    const queries = ['taxId=123', 'licenseNumber=abc', 'email=sem-arroba', 'nome=Silva']

    for (const query of queries) {
      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: `${FLEET_DRIVERS_PATH}/availability?${query}` }),
      )

      expect(response.status).toBe(400)
    }
    expect(fixture.driverAvailabilityCalls).toEqual([])
  })

  // A colisão é do campo, e o cliente precisa do código estável para ancorar a mensagem nele
  test('propagates a duplicate document as 409 with a stable code', async () => {
    const fixture = await createFleetHttpFixture({
      createDriverError: new ApiError({
        code: 'FLEET_DRIVER_TAX_ID_TAKEN',
        message: 'Another driver already uses the tax id',
        status: 409,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_DRIVER_BODY, method: 'POST', path: FLEET_DRIVERS_PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_TAX_ID_TAKEN')
  })
})
