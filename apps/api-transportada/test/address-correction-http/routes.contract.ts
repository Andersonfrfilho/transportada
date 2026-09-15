/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `PUT`/`GET /address-correction-requests` (spec 150, T103). O que estas fixam: o "como veio" e o
 * motivo nunca chegam pelo corpo (a fronteira só aceita `proposed`), a validação recusa **todos** os
 * campos inválidos de uma vez em `details[]`, e a ausência de endereço/contratante responde `404`
 * com o código estável do caso de uso — nunca um `500` genérico.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/fleet-http-payload.fixture.js'
import {
  ADDRESS_CORRECTION_REQUEST,
  PROPOSED_ADDRESS,
  createAddressCorrectionHttpFixture,
} from '../fixtures/address-correction-http.fixture.js'
import {
  AddressCorrectionAddressNotFoundError,
  AddressCorrectionContractorNotFoundError,
} from '../../src/address-correction/domain/address-correction.error.js'

const ADDRESS_CORRECTION_REQUESTS_PATH = '/address-correction-requests'
const ADDRESS_KEY = '3550308|01310100|45'

function requestPath(): string {
  return `${ADDRESS_CORRECTION_REQUESTS_PATH}/${encodeURIComponent(ADDRESS_KEY)}`
}

describe('address correction requests http contract', () => {
  describe('GET /address-correction-requests', () => {
    test('answers the state by addressKey for the company of the token', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: ADDRESS_CORRECTION_REQUESTS_PATH }),
      )

      expect(response.status).toBe(200)
      expect(await responseData(response)).toEqual([
        {
          addressKey: ADDRESS_CORRECTION_REQUEST.addressKey,
          id: ADDRESS_CORRECTION_REQUEST.id,
          proposed: ADDRESS_CORRECTION_REQUEST.proposed,
          reasonDistanceMetres: ADDRESS_CORRECTION_REQUEST.reasonDistanceMetres,
          reasonMatchLevel: ADDRESS_CORRECTION_REQUEST.reasonMatchLevel,
          recipientName: ADDRESS_CORRECTION_REQUEST.recipientName,
          reported: ADDRESS_CORRECTION_REQUEST.reported,
          sentAt: ADDRESS_CORRECTION_REQUEST.sentAt,
          status: ADDRESS_CORRECTION_REQUEST.status,
        },
      ])
      expect(fixture.listCalls).toEqual([{ companyId: fixture.companyId }])
    })

    test('never lets the answer be cached', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: ADDRESS_CORRECTION_REQUESTS_PATH }),
      )

      expect(response.headers.get('cache-control')).toBe('no-store')
    })

    test('rejects a caller without settings.manage', async () => {
      const fixture = await createAddressCorrectionHttpFixture({ permissions: new Set() })

      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: ADDRESS_CORRECTION_REQUESTS_PATH }),
      )

      expect(response.status).toBe(403)
      expect(fixture.listCalls).toEqual([])
    })
  })

  describe('PUT /address-correction-requests/:addressKey', () => {
    test('saves the draft with the proposed address, and answers 200 with the saved request', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({ body: { proposed: PROPOSED_ADDRESS }, method: 'PUT', path: requestPath() }),
      )

      expect(response.status).toBe(200)
      expect(await responseData(response)).toMatchObject({
        addressKey: ADDRESS_CORRECTION_REQUEST.addressKey,
        proposed: ADDRESS_CORRECTION_REQUEST.proposed,
      })
      expect(fixture.saveCalls).toHaveLength(1)
      expect(fixture.saveCalls[0]).toMatchObject({
        addressKey: ADDRESS_KEY,
        companyId: fixture.companyId,
        proposed: PROPOSED_ADDRESS,
      })
    })

    /** O "como veio" e o motivo nunca vêm do cliente — a fronteira nem aceita esses campos. */
    test('never accepts reported or reason fields from the body', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: {
            proposed: PROPOSED_ADDRESS,
            reasonMatchLevel: 'street',
            reported: { ...PROPOSED_ADDRESS, street: 'Rua Inventada' },
          },
          method: 'PUT',
          path: requestPath(),
        }),
      )

      expect(response.status).toBe(400)
      expect(fixture.saveCalls).toEqual([])
    })

    test('accepts a postal code with or without a hyphen, normalized to eight digits', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { proposed: { ...PROPOSED_ADDRESS, postalCode: '01310-100' } },
          method: 'PUT',
          path: requestPath(),
        }),
      )

      expect(response.status).toBe(200)
      expect(fixture.saveCalls[0]?.proposed.postalCode).toBe('01310100')
    })

    /** RF3: a recusa lista **todos** os campos inválidos de uma vez, não só o primeiro. */
    test('refuses with details for every invalid field at once', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: {
            proposed: {
              city: '',
              cityCode: '123',
              complement: null,
              district: null,
              number: '',
              postalCode: '1402',
              state: 'ZZ',
              street: '',
            },
          },
          method: 'PUT',
          path: requestPath(),
        }),
      )

      expect(response.status).toBe(400)
      const error = await responseApiError(response)
      const fields = (error.details ?? []).map((detail) => detail.field).sort()
      expect(fields).toEqual([
        'proposed.city',
        'proposed.cityCode',
        'proposed.number',
        'proposed.postalCode',
        'proposed.state',
        'proposed.street',
      ])
      expect(fixture.saveCalls).toEqual([])
    })

    /** RF3: `cityCode` de outra UF é recusado mesmo com a forma de 7 dígitos correta. */
    test('refuses a cityCode whose IBGE prefix does not match the proposed state', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { proposed: { ...PROPOSED_ADDRESS, cityCode: '3304557', state: 'SP' } },
          method: 'PUT',
          path: requestPath(),
        }),
      )

      expect(response.status).toBe(400)
      const error = await responseApiError(response)
      expect((error.details ?? []).map((detail) => detail.field)).toEqual(['proposed.cityCode'])
      expect(fixture.saveCalls).toEqual([])
    })

    test('refuses an address key that is not in this company report', async () => {
      const fixture = await createAddressCorrectionHttpFixture({
        saveError: new AddressCorrectionAddressNotFoundError(),
      })

      const response = await fixture.handle(
        jsonRequest({ body: { proposed: PROPOSED_ADDRESS }, method: 'PUT', path: requestPath() }),
      )

      expect(response.status).toBe(404)
      expect(await responseApiError(response)).toMatchObject({
        code: 'ADDRESS_CORRECTION_ADDRESS_NOT_FOUND',
      })
    })

    /** RF4/RF5: sem contratante cadastrada pelo CNPJ do emitente, o pedido não pode ser gravado. */
    test('refuses when the issuer has no contractor registered in this company', async () => {
      const fixture = await createAddressCorrectionHttpFixture({
        saveError: new AddressCorrectionContractorNotFoundError(),
      })

      const response = await fixture.handle(
        jsonRequest({ body: { proposed: PROPOSED_ADDRESS }, method: 'PUT', path: requestPath() }),
      )

      expect(response.status).toBe(404)
      expect(await responseApiError(response)).toMatchObject({
        code: 'ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND',
      })
    })

    test('refuses an address key that does not have the shape of one', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { proposed: PROPOSED_ADDRESS },
          method: 'PUT',
          path: `${ADDRESS_CORRECTION_REQUESTS_PATH}/whatever`,
        }),
      )

      expect(response.status).toBe(400)
      expect(fixture.saveCalls).toEqual([])
    })

    test('never lets the answer be cached', async () => {
      const fixture = await createAddressCorrectionHttpFixture()

      const response = await fixture.handle(
        jsonRequest({ body: { proposed: PROPOSED_ADDRESS }, method: 'PUT', path: requestPath() }),
      )

      expect(response.headers.get('cache-control')).toBe('no-store')
    })

    test('rejects a caller without settings.manage', async () => {
      const fixture = await createAddressCorrectionHttpFixture({ permissions: new Set() })

      const response = await fixture.handle(
        jsonRequest({ body: { proposed: PROPOSED_ADDRESS }, method: 'PUT', path: requestPath() }),
      )

      expect(response.status).toBe(403)
      expect(fixture.saveCalls).toEqual([])
    })
  })
})
