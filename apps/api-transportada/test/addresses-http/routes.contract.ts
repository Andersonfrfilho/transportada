/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A rota do CEP. O que ela fixa é a diferença entre as três respostas negativas: CEP fora de forma é
 * pedido malformado (400), CEP em forma que ninguém soube é ausência (404), e papel sem a permissão
 * não chega ao caso de uso (403). O 404 é o degrau em que o operador digita, e é por isso que ele
 * precisa ser distinguível do 400 no cliente.
 */
import { describe, expect, test } from 'bun:test'

import { jsonRequest, responseData } from '../fixtures/fleet-http-payload.fixture.js'
import { SUGGESTION, createPostalCodeHttpFixture } from '../fixtures/postal-code-http.fixture.js'

const POSTAL_CODES_PATH = '/postal-codes'

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { readonly error: { readonly code: string } }
  return body.error.code
}

describe('postal code http contract', () => {
  test('answers the suggestion for a caller with addresses.read', async () => {
    const fixture = await createPostalCodeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${POSTAL_CODES_PATH}/14020210` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(SUGGESTION)
    expect(fixture.lookupCalls).toEqual([{ companyId: fixture.companyId, postalCode: '14020210' }])
  })

  /** A empresa é do contexto autenticado — o caminho carrega o CEP, e só ele. */
  test('takes the company from the authenticated context, never from the path', async () => {
    const fixture = await createPostalCodeHttpFixture()

    await fixture.handle(jsonRequest({ method: 'GET', path: `${POSTAL_CODES_PATH}/14020-210` }))

    expect(fixture.lookupCalls).toEqual([{ companyId: fixture.companyId, postalCode: '14020210' }])
  })

  /** Nada guardado em cache: o CEP de hoje pode ter endereço amanhã, e a resposta é por empresa. */
  test('never lets the answer be cached', async () => {
    const fixture = await createPostalCodeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${POSTAL_CODES_PATH}/14020210` }),
    )

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  /** Ninguém soube: 404 é o sinal de que o campo fica digitável, não de que o pedido estava errado. */
  test('answers 404 when neither the database nor the providers knew', async () => {
    const fixture = await createPostalCodeHttpFixture({ suggestion: null })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${POSTAL_CODES_PATH}/14020210` }),
    )

    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('POSTAL_CODE_NOT_FOUND')
  })

  test('refuses a malformed postal code before reaching the use case', async () => {
    const fixture = await createPostalCodeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${POSTAL_CODES_PATH}/1402` }),
    )

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('POSTAL_CODE_INVALID')
    expect(fixture.lookupCalls).toEqual([])
  })

  test('rejects a caller without addresses.read', async () => {
    const fixture = await createPostalCodeHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${POSTAL_CODES_PATH}/14020210` }),
    )

    expect(response.status).toBe(403)
    expect(fixture.lookupCalls).toEqual([])
  })
})
