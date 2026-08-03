/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { ApiError } from '../../shared/api.error.js'
import {
  INVOICE_DOCUMENT_CONTENT_TYPE,
  INVOICE_DOCUMENT_KIND,
  INVOICE_DOCUMENT_PURPOSE,
  INVOICE_DOCUMENT_VERSION,
  type InvoiceDocumentArchivePort,
  type InvoiceDocumentInvoice,
  type InvoiceDocumentPage,
  type InvoiceDocumentRecord,
  type InvoiceDocumentRendererPort,
  type InvoiceDocumentRepositoryPort,
  type InvoiceDocumentRequest,
  type InvoiceDocumentView,
} from './invoice-document.port.js'

const STORAGE_OBJECT_STATUS = 'final'
const UNKNOWN_ERROR_CODE = 'BILLING_INVOICE_DOCUMENT_FAILED'

type Dependencies = {
  readonly archive: InvoiceDocumentArchivePort
  readonly clock: () => Date
  readonly createObjectId: () => string
  readonly renderer: InvoiceDocumentRendererPort
  readonly repository: InvoiceDocumentRepositoryPort
}

/** Sinaliza que outra requisição gravou o documento primeiro: a transação desfaz e o vencedor é relido. */
class InvoiceDocumentRaceError extends Error {}

export function createInvoiceDocumentUseCase(dependencies: Dependencies): {
  readonly generate: (input: InvoiceDocumentRequest) => Promise<InvoiceDocumentView>
  readonly list: (input: InvoiceDocumentRequest) => Promise<InvoiceDocumentPage>
} {
  return {
    generate: (input) => generateDocument(dependencies, input),
    list: (input) => listDocuments(dependencies, input),
  }
}

async function generateDocument(
  dependencies: Dependencies,
  input: InvoiceDocumentRequest,
): Promise<InvoiceDocumentView> {
  const invoice = await findInvoice(dependencies.repository, input)
  const existing = await dependencies.repository.findInvoiceDocument({
    companyId: invoice.companyId,
    documentKind: INVOICE_DOCUMENT_KIND,
    invoiceId: invoice.id,
  })
  if (existing !== null) {
    return presentDocument({ archive: dependencies.archive, invoice, record: existing })
  }

  const record = await createDocument(dependencies, { context: input.context, invoice })
  return presentDocument({ archive: dependencies.archive, invoice, record })
}

async function createDocument(
  dependencies: Dependencies,
  input: {
    readonly context: InvoiceDocumentRequest['context']
    readonly invoice: InvoiceDocumentInvoice
  },
): Promise<InvoiceDocumentRecord> {
  const { invoice } = input

  try {
    const rendered = await renderDocument(dependencies, invoice)
    const archived = await dependencies.archive.put({
      bytes: rendered.bytes,
      companyId: invoice.companyId,
      contentType: INVOICE_DOCUMENT_CONTENT_TYPE,
      invoiceId: invoice.id,
      objectId: rendered.objectId,
      sha256: rendered.sha256,
    })
    return await persistDocument(dependencies, { ...input, archived, rendered })
  } catch (error) {
    if (error instanceof InvoiceDocumentRaceError) {
      return resolveRaceWinner(dependencies.repository, invoice)
    }
    await dependencies.repository.createInvoiceEvent({
      actorUserId: input.context.userId,
      companyId: invoice.companyId,
      eventName: 'document_failed',
      invoiceId: invoice.id,
      payload: { documentKind: INVOICE_DOCUMENT_KIND, errorCode: resolveErrorCode(error) },
    })
    throw error
  }
}

type RenderedDocument = {
  readonly byteSize: bigint
  readonly bytes: Buffer
  readonly objectId: string
  readonly pageCount: number
  readonly sha256: string
}

async function renderDocument(
  dependencies: Dependencies,
  invoice: InvoiceDocumentInvoice,
): Promise<RenderedDocument> {
  const scope = { companyId: invoice.companyId, invoiceId: invoice.id }
  const [logo, profile, rows] = await Promise.all([
    dependencies.repository.findCompanyLogo({ companyId: invoice.companyId }),
    dependencies.repository.findFiscalProfile({ companyId: invoice.companyId }),
    dependencies.repository.findInvoiceReportRows(scope),
  ])
  const rendered = await dependencies.renderer.render({
    invoice,
    logo,
    observations: invoice.observations,
    printedAt: dependencies.clock(),
    profile,
    rows,
  })

  return {
    byteSize: BigInt(rendered.bytes.byteLength),
    bytes: rendered.bytes,
    objectId: dependencies.createObjectId(),
    pageCount: rendered.pageCount,
    sha256: createHash('sha256').update(rendered.bytes).digest('hex'),
  }
}

async function persistDocument(
  dependencies: Dependencies,
  input: {
    readonly archived: Awaited<ReturnType<InvoiceDocumentArchivePort['put']>>
    readonly context: InvoiceDocumentRequest['context']
    readonly invoice: InvoiceDocumentInvoice
    readonly rendered: RenderedDocument
  },
): Promise<InvoiceDocumentRecord> {
  const { archived, invoice, rendered } = input

  const operation = async (transaction: InvoiceDocumentRepositoryPort) => {
    await transaction.createStoredObject({
      bucket: archived.bucket,
      companyId: invoice.companyId,
      id: rendered.objectId,
      mimeType: INVOICE_DOCUMENT_CONTENT_TYPE,
      objectKey: archived.objectKey,
      provider: archived.provider,
      purpose: INVOICE_DOCUMENT_PURPOSE,
      sha256: rendered.sha256,
      sizeBytes: rendered.byteSize,
      status: STORAGE_OBJECT_STATUS,
    })
    const record = await transaction.createInvoiceDocument({
      byteSize: rendered.byteSize,
      companyId: invoice.companyId,
      documentKind: INVOICE_DOCUMENT_KIND,
      documentVersion: INVOICE_DOCUMENT_VERSION,
      invoiceId: invoice.id,
      mimeType: INVOICE_DOCUMENT_CONTENT_TYPE,
      objectId: rendered.objectId,
      sha256: rendered.sha256,
    })
    if (record === null) throw new InvoiceDocumentRaceError()

    await transaction.createInvoiceEvent({
      actorUserId: input.context.userId,
      companyId: invoice.companyId,
      eventName: 'document_generated',
      invoiceId: invoice.id,
      payload: {
        documentId: record.id,
        documentKind: INVOICE_DOCUMENT_KIND,
        documentVersion: INVOICE_DOCUMENT_VERSION.toString(),
        pageCount: rendered.pageCount,
        sha256: rendered.sha256,
      },
    })
    return record
  }

  return dependencies.repository.execute?.(operation) ?? operation(dependencies.repository)
}

async function listDocuments(
  dependencies: Dependencies,
  input: InvoiceDocumentRequest,
): Promise<InvoiceDocumentPage> {
  const invoice = await findInvoice(dependencies.repository, input)
  const records = await dependencies.repository.listInvoiceDocuments({
    companyId: invoice.companyId,
    invoiceId: invoice.id,
  })

  return {
    items: await Promise.all(
      records.map((record) => presentDocument({ archive: dependencies.archive, invoice, record })),
    ),
    nextCursor: null,
  }
}

async function findInvoice(
  repository: InvoiceDocumentRepositoryPort,
  input: InvoiceDocumentRequest,
): Promise<InvoiceDocumentInvoice> {
  const invoice = await repository.findInvoice({
    companyId: input.context.companyId,
    invoiceId: input.invoiceId,
  })
  if (invoice === null || invoice.companyId !== input.context.companyId) {
    throw invoiceNotFoundError()
  }
  return invoice
}

async function resolveRaceWinner(
  repository: InvoiceDocumentRepositoryPort,
  invoice: InvoiceDocumentInvoice,
): Promise<InvoiceDocumentRecord> {
  const winner = await repository.findInvoiceDocument({
    companyId: invoice.companyId,
    documentKind: INVOICE_DOCUMENT_KIND,
    invoiceId: invoice.id,
  })
  if (winner === null) throw documentConflictError()
  return winner
}

async function presentDocument(input: {
  readonly archive: InvoiceDocumentArchivePort
  readonly invoice: InvoiceDocumentInvoice
  readonly record: InvoiceDocumentRecord
}): Promise<InvoiceDocumentView> {
  const { record } = input
  const download = await input.archive.createDownloadUrl({
    bucket: record.bucket,
    fileName: `fatura-${input.invoice.invoiceNumber}.${record.documentKind}`,
    key: record.objectKey,
  })

  return {
    byteSize: Number(record.byteSize),
    contentType: record.mimeType,
    documentId: record.id,
    documentType: `invoice_${record.documentKind}`,
    downloadUrl: download.url,
    expiresAt: download.expiresAt,
    sha256: record.sha256,
  }
}

function resolveErrorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : UNKNOWN_ERROR_CODE
}

function invoiceNotFoundError(): ApiError {
  return new ApiError({
    code: 'BILLING_INVOICE_NOT_FOUND',
    message: 'Billing invoice was not found',
    status: 404,
  })
}

function documentConflictError(): ApiError {
  return new ApiError({
    code: 'BILLING_INVOICE_DOCUMENT_CONFLICT',
    message: 'Billing invoice document could not be archived',
    status: 409,
  })
}
