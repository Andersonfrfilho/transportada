/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { createInvoiceDocumentUseCase } from '../../src/billing/application/invoice-document.use-case.js'
import { InvoiceFiscalProfileMissingError } from '../../src/billing/domain/invoice-layout.error.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  ARCHIVED_DOCUMENT,
  DOCUMENT_ID,
  EXPIRES_AT,
  INVOICE_ID,
  LOGO,
  OBJECT_ID,
  PDF_BYTES,
  PRINTED_AT,
  createInvoiceDocumentFixture,
  captureApiError,
} from './invoice-document.support.js'

const PDF_SHA256 = createHash('sha256').update(PDF_BYTES).digest('hex')

describe('invoice document use case contract', () => {
  test('renderiza, arquiva com sha256 e registra documento e evento', async () => {
    const fixture = createInvoiceDocumentFixture()

    const document = await createInvoiceDocumentUseCase(fixture.dependencies).generate({
      context: fixture.context,
      invoiceId: INVOICE_ID,
    })

    expect(fixture.renderer.calls).toHaveLength(1)
    expect(fixture.archive.puts).toEqual([
      {
        bytes: PDF_BYTES,
        companyId: fixture.context.companyId,
        contentType: 'application/pdf',
        invoiceId: INVOICE_ID,
        objectId: OBJECT_ID,
        sha256: PDF_SHA256,
      },
    ])
    expect(document).toEqual({
      byteSize: PDF_BYTES.byteLength,
      contentType: 'application/pdf',
      documentId: DOCUMENT_ID,
      documentType: 'invoice_pdf',
      downloadUrl: `https://storage.test/${ARCHIVED_DOCUMENT.objectKey}`,
      expiresAt: EXPIRES_AT,
      sha256: PDF_SHA256,
    })

    // O nome do arquivo sai do número da fatura, não do id do objeto no bucket.
    expect(fixture.archive.downloadRequests).toEqual([
      {
        bucket: ARCHIVED_DOCUMENT.bucket,
        fileName: 'fatura-42.pdf',
        key: ARCHIVED_DOCUMENT.objectKey,
      },
    ])
  })

  test('objeto arquivado nasce final, com propósito de documento de faturamento', async () => {
    const fixture = createInvoiceDocumentFixture()

    await createInvoiceDocumentUseCase(fixture.dependencies).generate({
      context: fixture.context,
      invoiceId: INVOICE_ID,
    })

    expect(fixture.repository.storedObjects).toEqual([
      {
        bucket: ARCHIVED_DOCUMENT.bucket,
        companyId: fixture.context.companyId,
        id: OBJECT_ID,
        mimeType: 'application/pdf',
        objectKey: ARCHIVED_DOCUMENT.objectKey,
        provider: ARCHIVED_DOCUMENT.provider,
        purpose: 'billing_document',
        sha256: PDF_SHA256,
        sizeBytes: BigInt(PDF_BYTES.byteLength),
        status: 'final',
      },
    ])
    expect(fixture.repository.documents).toEqual([
      {
        byteSize: BigInt(PDF_BYTES.byteLength),
        companyId: fixture.context.companyId,
        documentKind: 'pdf',
        documentVersion: 1n,
        invoiceId: INVOICE_ID,
        mimeType: 'application/pdf',
        objectId: OBJECT_ID,
        sha256: PDF_SHA256,
      },
    ])
    expect(fixture.repository.events).toEqual([
      {
        actorUserId: fixture.context.userId,
        companyId: fixture.context.companyId,
        eventName: 'document_generated',
        invoiceId: INVOICE_ID,
        payload: {
          documentId: DOCUMENT_ID,
          documentKind: 'pdf',
          documentVersion: '1',
          pageCount: 2,
          sha256: PDF_SHA256,
        },
      },
    ])
  })

  test('repetir a chamada devolve o documento já arquivado sem renderizar nem duplicar', async () => {
    const fixture = createInvoiceDocumentFixture()
    const useCase = createInvoiceDocumentUseCase(fixture.dependencies)

    const first = await useCase.generate({ context: fixture.context, invoiceId: INVOICE_ID })
    const second = await useCase.generate({ context: fixture.context, invoiceId: INVOICE_ID })

    expect(second).toEqual(first)
    expect(fixture.renderer.calls).toHaveLength(1)
    expect(fixture.archive.puts).toHaveLength(1)
    expect(fixture.repository.documents).toHaveLength(1)
    expect(fixture.repository.storedObjects).toHaveLength(1)
    expect(fixture.repository.events).toHaveLength(1)
  })

  test('falha no arquivamento emite document_failed, propaga o erro e não deixa registro órfão', async () => {
    const fixture = createInvoiceDocumentFixture()
    fixture.archive.failure = new ApiError({
      code: 'STORAGE_OBJECT_WRITE_FAILED',
      message: 'Object storage rejected the write',
      status: 502,
    })

    const error = await captureApiError(() =>
      createInvoiceDocumentUseCase(fixture.dependencies).generate({
        context: fixture.context,
        invoiceId: INVOICE_ID,
      }),
    )

    expect(error.code).toBe('STORAGE_OBJECT_WRITE_FAILED')
    expect(fixture.repository.documents).toHaveLength(0)
    expect(fixture.repository.storedObjects).toHaveLength(0)
    expect(fixture.repository.events).toEqual([
      {
        actorUserId: fixture.context.userId,
        companyId: fixture.context.companyId,
        eventName: 'document_failed',
        invoiceId: INVOICE_ID,
        payload: { documentKind: 'pdf', errorCode: 'STORAGE_OBJECT_WRITE_FAILED' },
      },
    ])
  })

  test('empresa sem perfil fiscal falha com o erro de domínio e registra document_failed', async () => {
    const fixture = createInvoiceDocumentFixture()
    fixture.repository.profile = null

    const error = await captureApiError(() =>
      createInvoiceDocumentUseCase(fixture.dependencies).generate({
        context: fixture.context,
        invoiceId: INVOICE_ID,
      }),
    )

    expect(error).toBeInstanceOf(InvoiceFiscalProfileMissingError)
    expect(error.status).toBe(422)
    expect(fixture.repository.events.map((event) => event['eventName'])).toEqual([
      'document_failed',
    ])
    expect(fixture.archive.puts).toHaveLength(0)
  })

  test('fatura de outra empresa devolve não encontrada sem renderizar nada', async () => {
    const fixture = createInvoiceDocumentFixture()
    fixture.repository.invoice = { ...fixture.repository.invoice, companyId: 'company-outra' }

    const error = await captureApiError(() =>
      createInvoiceDocumentUseCase(fixture.dependencies).generate({
        context: fixture.context,
        invoiceId: INVOICE_ID,
      }),
    )

    expect(error.code).toBe('BILLING_INVOICE_NOT_FOUND')
    expect(error.status).toBe(404)
    expect(fixture.renderer.calls).toHaveLength(0)
    expect(fixture.repository.events).toHaveLength(0)
  })

  test('corrida perdida devolve o documento do vencedor sem gravar segundo registro', async () => {
    const fixture = createInvoiceDocumentFixture()
    fixture.repository.loseInsertRace = true

    const document = await createInvoiceDocumentUseCase(fixture.dependencies).generate({
      context: fixture.context,
      invoiceId: INVOICE_ID,
    })

    expect(document.documentId).toBe(DOCUMENT_ID)
    expect(fixture.repository.documents).toHaveLength(0)
    expect(fixture.repository.storedObjects).toHaveLength(0)
    expect(fixture.repository.events).toHaveLength(0)
  })

  test('listagem devolve URL assinada real com expiração, sem chave de storage', async () => {
    const fixture = createInvoiceDocumentFixture()
    const useCase = createInvoiceDocumentUseCase(fixture.dependencies)
    await useCase.generate({ context: fixture.context, invoiceId: INVOICE_ID })

    const page = await useCase.list({ context: fixture.context, invoiceId: INVOICE_ID })

    expect(page).toEqual({
      items: [
        {
          byteSize: PDF_BYTES.byteLength,
          contentType: 'application/pdf',
          documentId: DOCUMENT_ID,
          documentType: 'invoice_pdf',
          downloadUrl: `https://storage.test/${ARCHIVED_DOCUMENT.objectKey}`,
          expiresAt: EXPIRES_AT,
          sha256: PDF_SHA256,
        },
      ],
      nextCursor: null,
    })
    expect(JSON.stringify(page)).not.toContain('objectKey')
  })

  test('o PDF é impresso com o relógio injetado, não com a hora da máquina', async () => {
    const fixture = createInvoiceDocumentFixture()

    await createInvoiceDocumentUseCase(fixture.dependencies).generate({
      context: fixture.context,
      invoiceId: INVOICE_ID,
    })

    expect(fixture.renderer.calls[0]?.printedAt).toEqual(new Date(PRINTED_AT))
  })

  test('o logo cadastrado pela empresa chega ao renderizador', async () => {
    const fixture = createInvoiceDocumentFixture()
    fixture.repository.logo = LOGO

    await createInvoiceDocumentUseCase(fixture.dependencies).generate({
      context: fixture.context,
      invoiceId: INVOICE_ID,
    })

    expect(fixture.renderer.calls[0]?.logo).toEqual(LOGO)
  })

  test('empresa sem logo cadastrado renderiza a fatura mesmo assim', async () => {
    const fixture = createInvoiceDocumentFixture()

    const document = await createInvoiceDocumentUseCase(fixture.dependencies).generate({
      context: fixture.context,
      invoiceId: INVOICE_ID,
    })

    expect(fixture.renderer.calls[0]?.logo).toBeNull()
    expect(document.documentId).toBe(DOCUMENT_ID)
  })
})
