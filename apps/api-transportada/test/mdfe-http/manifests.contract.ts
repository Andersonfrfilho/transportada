/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CREATE_MANIFEST_BODY,
  DISCARDED_MANIFEST_DETAIL,
  DOCUMENT_ID,
  DRIVER_ID,
  MANIFEST_DETAIL,
  MANIFEST_ID,
  MANIFEST_PAGE,
  MDFE_MANIFESTS_PATH,
  READ_ONLY_PERMISSIONS,
  VEHICLE_ID,
  createMdfeHttpFixture,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/mdfe-http.fixture.js'

const MANIFEST_PATH = `${MDFE_MANIFESTS_PATH}/${MANIFEST_ID}`

describe('POST /mdfe-manifests', () => {
  test('creates the manifest and answers 201 with the frozen detail', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_MANIFEST_BODY, method: 'POST', path: MDFE_MANIFESTS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toEqual(MANIFEST_DETAIL)
    expect(fixture.createCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        manifest: {
          additionalInformation: '',
          cargoProduct: 'Bebidas',
          cargoProductNcm: '22021000',
          cargoType: '05',
          cargoUnit: '01',
          contractorName: 'Industria Contratante',
          contractorTaxId: '11222333000181',
          destinationState: 'SP',
          dischargePostalCode: '01310100',
          documentIds: [DOCUMENT_ID],
          driverIds: [DRIVER_ID],
          emitterType: '1',
          freightValue: '480.00',
          insuranceEndorsement: '12345678901234',
          loadingPostalCode: '80010000',
          transporterType: '1',
          tripStartedAt: null,
          vehicleId: VEHICLE_ID,
        },
      },
    ])
  })

  test('refuses a body that tries to choose its own company or fiscal number', async () => {
    const fixture = await createMdfeHttpFixture()

    for (const body of [
      { ...CREATE_MANIFEST_BODY, companyId: COMPANY_CONTEXT.companyId },
      { ...CREATE_MANIFEST_BODY, fiscalNumber: 12 },
      { ...CREATE_MANIFEST_BODY, rntrc: '12345678' },
      { ...CREATE_MANIFEST_BODY, status: 'authorized' },
    ]) {
      const response = await fixture.handle(
        jsonRequest({ body, method: 'POST', path: MDFE_MANIFESTS_PATH }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    }
    expect(fixture.createCalls).toEqual([])
  })

  test('refuses a selection or a crew the layout does not accept', async () => {
    const fixture = await createMdfeHttpFixture()

    for (const body of [
      { ...CREATE_MANIFEST_BODY, documentIds: [] },
      { ...CREATE_MANIFEST_BODY, documentIds: ['not-a-uuid'] },
      { ...CREATE_MANIFEST_BODY, driverIds: [] },
      { ...CREATE_MANIFEST_BODY, driverIds: Array.from({ length: 11 }, () => DRIVER_ID) },
      { ...CREATE_MANIFEST_BODY, cargoType: '99' },
      { ...CREATE_MANIFEST_BODY, destinationState: 'sp' },
      { ...CREATE_MANIFEST_BODY, emitterType: '9' },
      { ...CREATE_MANIFEST_BODY, vehicleId: 'not-a-uuid' },
    ]) {
      const response = await fixture.handle(
        jsonRequest({ body, method: 'POST', path: MDFE_MANIFESTS_PATH }),
      )

      expect(response.status).toBe(400)
    }
    expect(fixture.createCalls).toEqual([])
  })

  test('denies who can only read the manifests', async () => {
    const fixture = await createMdfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_MANIFEST_BODY, method: 'POST', path: MDFE_MANIFESTS_PATH }),
    )

    expect(response.status).toBe(403)
    expect(fixture.createCalls).toEqual([])
  })

  test('answers the domain refusal with its own status and code', async () => {
    const fixture = await createMdfeHttpFixture({
      createError: new ApiError({
        code: 'MDFE_MANIFEST_DOCUMENTS_BLOCKED',
        message: 'A blocked CT-e cannot be manifested.',
        status: 422,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_MANIFEST_BODY, method: 'POST', path: MDFE_MANIFESTS_PATH }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('MDFE_MANIFEST_DOCUMENTS_BLOCKED')
  })
})

describe('GET /mdfe-manifests', () => {
  test('lists the manifests of the company with the page cursor', async () => {
    const fixture = await createMdfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: MDFE_MANIFESTS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [...MANIFEST_PAGE.items],
      page: { nextCursor: MANIFEST_PAGE.nextCursor },
    })
    expect(fixture.listCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS },
        cursor: null,
        limit: 25,
      },
    ])
  })

  test('forwards the filters and the paging the operator asked for', async () => {
    const fixture = await createMdfeHttpFixture()
    const cursor = MANIFEST_PAGE.nextCursor

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${MDFE_MANIFESTS_PATH}?statusEq=authorized&vehicleIdEq=${VEHICLE_ID}&limit=5&cursor=${encodeURIComponent(cursor)}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor,
        filters: { statusEq: 'authorized', vehicleIdEq: VEHICLE_ID },
        limit: 5,
      },
    ])
  })

  test('refuses a query it does not know how to honour', async () => {
    const fixture = await createMdfeHttpFixture()

    for (const query of [
      '?companyId=00000000-0000-4000-8000-000000000001',
      '?statusEq=flying',
      '?limit=0',
      '?limit=101',
      '?cursor=yesterday',
      '?vehicleIdEq=not-a-uuid',
    ]) {
      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: `${MDFE_MANIFESTS_PATH}${query}` }),
      )

      expect(response.status).toBe(400)
    }
    expect(fixture.listCalls).toEqual([])
  })
})

describe('GET /mdfe-manifests/:id', () => {
  test('answers the manifest with its items, drivers and loading cities', async () => {
    const fixture = await createMdfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: MANIFEST_PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(MANIFEST_DETAIL)
    expect(fixture.getCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS },
        manifestId: MANIFEST_ID,
      },
    ])
  })

  test('refuses an identifier that is not a manifest id', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${MDFE_MANIFESTS_PATH}/not-a-uuid` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('NOT_FOUND')
    expect(fixture.getCalls).toEqual([])
  })

  test('answers 404 when the manifest is not in this company', async () => {
    const fixture = await createMdfeHttpFixture({
      getError: new ApiError({
        code: 'MDFE_MANIFEST_NOT_FOUND',
        message: 'Manifest not found.',
        status: 404,
      }),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: MANIFEST_PATH }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('MDFE_MANIFEST_NOT_FOUND')
  })
})

describe('POST /mdfe-manifests/:id/discard', () => {
  test('discards the manifest and answers 200 with the released detail', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${MANIFEST_PATH}/discard` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(DISCARDED_MANIFEST_DETAIL)
    expect(fixture.discardCalls).toEqual([{ context: COMPANY_CONTEXT, manifestId: MANIFEST_ID }])
  })

  test('refuses a reader with no mdfe.manage', async () => {
    const fixture = await createMdfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${MANIFEST_PATH}/discard` }),
    )

    expect(response.status).toBe(403)
    expect(fixture.discardCalls).toEqual([])
  })

  test('refuses an identifier that is not a manifest id', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${MDFE_MANIFESTS_PATH}/not-a-uuid/discard` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('NOT_FOUND')
    expect(fixture.discardCalls).toEqual([])
  })

  test('answers 409 when the manifest is already with the SEFAZ', async () => {
    const fixture = await createMdfeHttpFixture({
      discardError: new ApiError({
        code: 'MDFE_MANIFEST_NOT_DISCARDABLE',
        message: 'The manifest cannot be discarded in its current state.',
        status: 409,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${MANIFEST_PATH}/discard` }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('MDFE_MANIFEST_NOT_DISCARDABLE')
  })
})
