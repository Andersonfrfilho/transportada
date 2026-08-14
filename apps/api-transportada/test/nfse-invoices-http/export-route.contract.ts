/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NFSE_EXPORT_MAX_DOCUMENTS } from '../../src/nfse-invoices/application/export-nfse-documents.port'
import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  COMPANY_CONTEXT,
  EXPORT_FILE_NAME,
  INVOICE_ID,
  OTHER_DOCUMENT_ID,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
} from '../fixtures/nfse-invoices-http.fixture'

const EXPORT_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/export`

function exportRequest(body: unknown): Request {
  return invoiceRequest({ body, idempotencyKey: null, path: EXPORT_PATH })
}

describe('nfse export http', () => {
  test('a exportação devolve o ZIP como anexo', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(exportRequest({ invoiceIds: [INVOICE_ID] }))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${EXPORT_FILE_NAME}"`,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  /** Exportar é leitura: exigir chave de idempotência aqui só faria o cliente inventar uma. */
  test('a rota não exige chave de idempotência', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(exportRequest({ invoiceIds: [INVOICE_ID] }))

    expect(response.status).toBe(200)
    expect(fixture.exportCalls).toHaveLength(1)
  })

  test('a empresa da exportação vem do contexto autenticado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(exportRequest({ invoiceIds: [INVOICE_ID] }))

    expect(fixture.exportCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
    expect(fixture.exportCalls[0]?.invoiceIds).toEqual([INVOICE_ID])
  })

  /** `companyId` no corpo é chave desconhecida: o schema é `.strict()` e recusa antes do caso de uso. */
  test('corpo com chave desconhecida é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      exportRequest({ companyId: COMPANY_CONTEXT.companyId, invoiceIds: [INVOICE_ID] }),
    )

    expect(response.status).toBe(400)
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('seleção vazia é recusada na fronteira', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(exportRequest({ invoiceIds: [] }))

    expect(response.status).toBe(400)
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('seleção acima do teto é recusada na fronteira', async () => {
    const fixture = await createNfseInvoicesHttpFixture()
    const invoiceIds = Array.from({ length: NFSE_EXPORT_MAX_DOCUMENTS + 1 }, () =>
      crypto.randomUUID(),
    )

    const response = await fixture.handle(exportRequest({ invoiceIds }))

    expect(response.status).toBe(400)
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('formato desconhecido é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      exportRequest({ format: 'planilha', invoiceIds: [INVOICE_ID] }),
    )

    expect(response.status).toBe(400)
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('o formato pedido chega ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(exportRequest({ format: 'xml', invoiceIds: [INVOICE_ID] }))

    expect(fixture.exportCalls[0]?.format).toBe('xml')
  })

  test('identificador fora do formato UUID é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(exportRequest({ invoiceIds: ['nao-e-uuid'] }))

    expect(response.status).toBe(400)
    expect(fixture.exportCalls).toHaveLength(0)
  })

  /** Exportar documento fiscal é leitura de nota: quem lê a tabela leva o arquivo dela. */
  test('sem a permissão de leitura a exportação é negada', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: new Set(['nfse.issue']) })

    const response = await fixture.handle(exportRequest({ invoiceIds: [OTHER_DOCUMENT_ID] }))

    expect(response.status).toBe(403)
    expect(fixture.exportCalls).toHaveLength(0)
  })
})
