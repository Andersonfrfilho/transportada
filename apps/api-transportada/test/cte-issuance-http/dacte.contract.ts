/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error'
import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  DACTE_FILE_NAME,
  DACTE_PDF_BYTES,
  READ_ONLY_CONTEXT,
  createCteIssuanceHttpFixture,
  downloadDacteRequest,
  responseApiError,
  unauthenticatedError,
} from '../fixtures/cte-issuance-http.fixture'

describe('DACTE download HTTP contract', () => {
  test('devolve o PDF com nome de download', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(downloadDacteRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${DACTE_FILE_NAME}"`,
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(DACTE_PDF_BYTES)
  })

  test('não guarda o documento fiscal em cache do navegador', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(downloadDacteRequest())

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('recebe o item do caminho e a empresa do contexto autenticado', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    await fixture.handle(downloadDacteRequest())

    expect(fixture.dacteCalls).toHaveLength(1)
    expect(fixture.dacteCalls[0]?.batchId).toBe(BATCH_ID)
    expect(fixture.dacteCalls[0]?.batchItemId).toBe(BATCH_ITEM_ID)
    expect(fixture.dacteCalls[0]?.context.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  test('some com 404 para identificador que não é UUID, sem chegar na aplicação', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(downloadDacteRequest({ batchItemId: 'not-a-uuid' }))

    expect(response.status).toBe(404)
    expect(fixture.dacteCalls).toHaveLength(0)
  })

  test('propaga o 404 de item que não é da empresa', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      dacteError: new ApiError({
        code: 'DACTE_DOCUMENT_NOT_FOUND',
        message: 'CT-e batch item was not found',
        status: 404,
      }),
    })

    const response = await fixture.handle(downloadDacteRequest())

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('DACTE_DOCUMENT_NOT_FOUND')
  })

  test('propaga o 422 de CT-e ainda não autorizado', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      dacteError: new ApiError({
        code: 'DACTE_DOCUMENT_NOT_AUTHORIZED',
        message: 'CT-e has no authorized document to print',
        status: 422,
      }),
    })

    const response = await fixture.handle(downloadDacteRequest())

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).error.code).toBe('DACTE_DOCUMENT_NOT_AUTHORIZED')
  })

  test('exige a permissão de transmissão de CT-e', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(downloadDacteRequest())

    expect(response.status).toBe(403)
    expect(fixture.dacteCalls).toHaveLength(0)
  })

  test('exige autenticação antes de qualquer leitura', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(downloadDacteRequest())

    expect(response.status).toBe(401)
    expect(fixture.dacteCalls).toHaveLength(0)
  })
})
