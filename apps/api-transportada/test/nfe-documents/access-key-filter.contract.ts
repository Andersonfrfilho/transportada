/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_CONTEXT } from '../fixtures/nfe-import-application.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { DOCUMENT_ACCESS_KEY } from '../fixtures/nfe-http-payload.fixture'
import { documentsListRequest, responseApiError } from '../fixtures/nfe-http-request.fixture'

/** Emitente de CNPJ alfanumérico: a chave herda as doze posições da base, letra inclusive. */
const ALPHANUMERIC_ACCESS_KEY = '3526074A1B2C3D000191550010000000022000000022'

describe('NF-e document listing filtered by access key', () => {
  test('carries the key to the application layer beside the tenant page', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentsListRequest({ query: `?accessKey=${DOCUMENT_ACCESS_KEY}` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.documentListCalls).toEqual([
      { accessKey: DOCUMENT_ACCESS_KEY, context: COMPANY_CONTEXT, cursor: null, limit: 25 },
    ])
  })

  test('accepts the key of an alphanumeric issuer', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentsListRequest({ query: `?accessKey=${ALPHANUMERIC_ACCESS_KEY}` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.documentListCalls.at(0)?.accessKey).toBe(ALPHANUMERIC_ACCESS_KEY)
  })

  test('canonicalizes the case before matching, as the tax id schema does', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentsListRequest({ query: `?accessKey=${ALPHANUMERIC_ACCESS_KEY.toLowerCase()}` }),
    )

    expect(response.status).toBe(200)
    expect(fixture.documentListCalls.at(0)?.accessKey).toBe(ALPHANUMERIC_ACCESS_KEY)
  })

  test('leaves the filter absent when the query does not carry a key', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentsListRequest())

    expect(response.status).toBe(200)
    expect(fixture.documentListCalls).toEqual([
      { accessKey: null, context: COMPANY_CONTEXT, cursor: null, limit: 25 },
    ])
  })

  test('keeps the cursor page working beside the key', async () => {
    const fixture = await createNfeHttpFixture()
    const cursor = '2026-07-22T14:01:00.000Z::00000000-0000-4000-8000-000000000230'

    const response = await fixture.handle(
      documentsListRequest({
        query: `?accessKey=${DOCUMENT_ACCESS_KEY}&cursor=${cursor}&limit=10`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.documentListCalls).toEqual([
      { accessKey: DOCUMENT_ACCESS_KEY, context: COMPANY_CONTEXT, cursor, limit: 10 },
    ])
  })

  test('refuses a malformed key before touching the application layer', async () => {
    const malformed = [
      DOCUMENT_ACCESS_KEY.slice(0, 43),
      `${DOCUMENT_ACCESS_KEY}0`,
      '',
      '   ',
      // Letra fora das doze posições do CNPJ: o resto da chave é dígito, sempre.
      `A${DOCUMENT_ACCESS_KEY.slice(1)}`,
      `${DOCUMENT_ACCESS_KEY.slice(0, 43)}A`,
      // Fora do conjunto `[A-Z0-9]`, mesmo no lugar certo.
      `352607-1156864000191550010000000022000000022`,
    ]

    for (const value of malformed) {
      const fixture = await createNfeHttpFixture()

      const response = await fixture.handle(
        documentsListRequest({ query: `?accessKey=${encodeURIComponent(value)}` }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.documentListCalls).toEqual([])
    }
  })

  test('refuses the key repeated in the same query string', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      documentsListRequest({
        query: `?accessKey=${DOCUMENT_ACCESS_KEY}&accessKey=${DOCUMENT_ACCESS_KEY}`,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.documentListCalls).toEqual([])
  })

  /**
   * Chave de outra empresa não é 404 nem 403: o filtro de tenant já está na query, então a nota
   * simplesmente não aparece — e nota inexistente responde igual, que é o que impede a varredura.
   */
  test('answers an empty page for a key that does not belong to the company', async () => {
    const fixture = await createNfeHttpFixture({ documentList: { items: [], nextCursor: null } })

    const response = await fixture.handle(
      documentsListRequest({ query: `?accessKey=${ALPHANUMERIC_ACCESS_KEY}` }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [], page: { nextCursor: null } })
  })
})
