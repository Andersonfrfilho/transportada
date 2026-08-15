/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error'
import {
  DOCUMENT_ID,
  REPROCESS_RESPONSE,
  serializeImportSummary,
} from '../fixtures/nfe-http-payload.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import {
  documentXmlRequest,
  importItemsRequest,
  invalidDocumentXmlRequest,
  reprocessImportRequest,
  responseApiError,
} from '../fixtures/nfe-http-request.fixture'
import { COMPANY_CONTEXT, IMPORT_ID } from '../fixtures/nfe-import-application.fixture'

describe('nfe http download and reprocess contract', () => {
  test('downloads xml only after tenant authorization with safe headers and filename', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentXmlRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/xml')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="35260761156864000191550010000000022000000022.xml"',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toContain('<nfeProc')
    expect(fixture.documentDownloadCalls).toEqual([
      { context: COMPANY_CONTEXT, documentId: DOCUMENT_ID },
    ])
  })

  test('never lets a stored filename escape into the content-disposition header', async () => {
    const alphanumericKey = '35260712ABC34501DE35550010000000022000000022'
    const fixture = await createNfeHttpFixture({
      downloadResult: {
        accessKey: alphanumericKey,
        content: new TextEncoder().encode('<nfeProc />'),
        contentType: 'application/xml',
        fileName: '../../etc/passwd',
      },
    })

    const response = await fixture.handle(documentXmlRequest())

    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${alphanumericKey}.xml"`,
    )
  })

  /**
   * O repositório sempre monta o nome como `${accessKey}.xml`, então a queda para a chave devolve
   * exatamente a mesma string e o defeito não aparece na resposta HTTP. O que se guarda aqui é a
   * guarda em si: um literal só de dígito recusa toda chave de emitente com CNPJ alfanumérico.
   */
  test('validates the stored filename against the shared access key pattern', async () => {
    const source = await Bun.file(
      new URL('../../src/nfe-documents/presentation/nfe-documents.routes.ts', import.meta.url),
    ).text()

    expect(source).toContain('CHAVE_PATTERN')
    expect(source).not.toMatch(/\[0-9\]\{44\}\\\.xml/u)
  })

  test('returns the same 404 for missing or cross-tenant document downloads', async () => {
    const notFound = new ApiError({
      code: 'NFE_DOCUMENT_NOT_FOUND',
      message: 'NF-e document not found',
      status: 404,
    })
    const response = await (
      await createNfeHttpFixture({
        downloadError: notFound,
      })
    ).handle(invalidDocumentXmlRequest())

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe(notFound.code)
  })

  test('reprocesses only by import id path and returns 202 with safe summary', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      reprocessImportRequest(undefined, { correlationId: 'reprocess-correlation-id' }),
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ data: serializeImportSummary(REPROCESS_RESPONSE) })
    expect(fixture.reprocessCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'reprocess-correlation-id',
        importId: IMPORT_ID,
      },
    ])
  })

  test('returns import items through the explicit items route without XML payloads', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(importItemsRequest())
    const body = (await response.json()) as { readonly data: readonly unknown[] }

    expect(response.status).toBe(200)
    expect(Array.isArray(body.data)).toBeTrue()
    expect(JSON.stringify(body)).not.toContain('"xml"')
    expect(JSON.stringify(body)).not.toContain('"content"')
  })

  test('propagates safe 404 and 409 reprocess errors without tenant leakage', async () => {
    for (const error of [
      new ApiError({
        code: 'NFE_IMPORT_NOT_FOUND',
        message: 'NF-e import not found',
        status: 404,
      }),
      new ApiError({
        code: 'NFE_IMPORT_REPROCESS_NOT_ALLOWED',
        message: 'NF-e import cannot be reprocessed',
        status: 409,
      }),
    ]) {
      const fixture = await createNfeHttpFixture({ reprocessError: error })
      const response = await fixture.handle(reprocessImportRequest())
      expect(response.status).toBe(error.status)
      const body = await responseApiError(response)
      expect(body.error.code).toBe(error.code)
      expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
    }
  })
})
