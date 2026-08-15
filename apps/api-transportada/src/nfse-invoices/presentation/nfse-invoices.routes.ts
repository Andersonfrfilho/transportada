/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_NFSE_SERVICE_INVOICES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  NFSE_EXPORT_CONTENT_TYPE,
  type NfseExportRequest,
  type NfseExportResult,
} from '../application/export-nfse-documents.port.js'
import type { NfseInvoiceCancellationSummary } from '../application/nfse-invoice-cancellation.use-case.js'
import type { CancelNfseInvoiceInput } from '../application/nfse-invoice-cancellation.use-case.js'
import type {
  NfseInvoicePreview,
  NfseInvoicePreviewItem,
} from '../application/nfse-invoice-preview.service.js'
import type {
  DownloadNfseFiscalDocumentInput,
  ListNfseInvoicesInput,
  NfseInvoiceScopedInput,
} from '../application/nfse-invoice-query.use-case.js'
import type {
  NfseFiscalDocumentDownload,
  NfseInvoiceDelivery,
  NfseInvoiceDetail,
  NfseInvoiceLinkedDocument,
  NfseInvoiceListItem,
  NfseInvoicePage,
} from '../application/nfse-invoice.port.js'
import type {
  CreateNfseInvoiceInput,
  PreviewNfseInvoiceInput,
} from '../application/nfse-invoice.use-case.js'
import type { NfseInvoiceSummary } from '../application/nfse-issuance-attempt.service.js'
import {
  nfseInvoiceCancellationSchema,
  nfseInvoiceExportSchema,
  nfseInvoiceSelectionSchema,
  parseNfseInvoiceList,
  parseUuidPathIdentifier,
} from './nfse-invoices.schema.js'

const NFSE_READ_POLICY = { permission: 'nfse.read', scope: 'company' } as const
const NFSE_ISSUE_POLICY = { permission: 'nfse.issue', scope: 'company' } as const
/** Cancelar tem permissão própria: quem emite não necessariamente pode derrubar nota autorizada. */
const NFSE_CANCEL_POLICY = { permission: 'nfse.cancel', scope: 'company' } as const
const CANCEL_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/:id/cancel`
const DOCUMENTS_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/:id/documents`
const EXPORT_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/export`
const INVOICE_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/:id`
const PDF_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/:id/pdf`
const PREVIEW_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/preview`
const XML_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/:id/xml`

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly cancelNfseInvoice: {
    execute(input: TenantInput<CancelNfseInvoiceInput>): Promise<NfseInvoiceCancellationSummary>
  }
  readonly exportNfseDocuments: {
    exportDocuments(input: TenantInput<NfseExportRequest>): Promise<NfseExportResult>
  }
  readonly nfseInvoice: {
    create(input: TenantInput<CreateNfseInvoiceInput>): Promise<NfseInvoiceSummary>
    preview(input: TenantInput<PreviewNfseInvoiceInput>): Promise<NfseInvoicePreview>
  }
  readonly nfseInvoiceQuery: {
    detail(input: TenantInput<NfseInvoiceScopedInput>): Promise<NfseInvoiceDetail>
    documents(
      input: TenantInput<NfseInvoiceScopedInput>,
    ): Promise<readonly NfseInvoiceLinkedDocument[]>
    download(
      input: TenantInput<DownloadNfseFiscalDocumentInput>,
    ): Promise<NfseFiscalDocumentDownload>
    list(input: TenantInput<ListNfseInvoicesInput>): Promise<NfseInvoicePage>
  }
}

export function createNfseInvoiceRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<PreviewNfseInvoiceInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const preview = await dependencies.nfseInvoice.preview({ context: context.scope, ...input })
        return jsonResponse({
          body: {
            data: {
              blocked: preview.blocked.map((block) => ({
                documentId: block.documentId,
                reason: block.reason,
              })),
              invoices: preview.invoices.map(serializeInvoice),
            },
          },
          status: 200,
        })
      },
      method: 'POST',
      async parse({ request }) {
        return parseBody(nfseInvoiceSelectionSchema, request)
      },
      pathname: PREVIEW_PATH,
      policy: NFSE_READ_POLICY,
    }),
    /**
     * O ZIP sai em stream e o nome do arquivo vai no cabeçalho: exportar é leitura, e exigir chave
     * de idempotência aqui só faria o cliente inventar uma.
     */
    defineRoute<Omit<NfseExportRequest, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.exportNfseDocuments.exportDocuments({
          context: context.scope,
          ...input,
        })
        return new Response(result.stream, {
          headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="${result.fileName}"`,
            'content-type': NFSE_EXPORT_CONTENT_TYPE,
          },
          status: 200,
        })
      },
      method: 'POST',
      async parse({ request }) {
        const { format, invoiceIds } = await parseBody(nfseInvoiceExportSchema, request)
        return { ...(format === undefined ? {} : { format }), invoiceIds }
      },
      pathname: EXPORT_PATH,
      policy: NFSE_READ_POLICY,
    }),
    defineRoute<Omit<CreateNfseInvoiceInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.nfseInvoice.create({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeSummary(summary) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          ...(await parseBody(nfseInvoiceSelectionSchema, request)),
        }
      },
      pathname: API_NFSE_SERVICE_INVOICES_PATH,
      policy: NFSE_ISSUE_POLICY,
    }),
    defineRoute<Omit<ListNfseInvoicesInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.nfseInvoiceQuery.list({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: page.items.map(serializeListItem), page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseNfseInvoiceList(new URL(request.url)),
      pathname: API_NFSE_SERVICE_INVOICES_PATH,
      policy: NFSE_READ_POLICY,
    }),
    defineRoute<Omit<NfseInvoiceScopedInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const invoice = await dependencies.nfseInvoiceQuery.detail({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeDetail(invoice) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: INVOICE_PATH,
      policy: NFSE_READ_POLICY,
    }),
    defineRoute<Omit<NfseInvoiceScopedInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const documents = await dependencies.nfseInvoiceQuery.documents({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: documents.map(serializeDocument) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: DOCUMENTS_PATH,
      policy: NFSE_READ_POLICY,
    }),
    defineRoute<Omit<CancelNfseInvoiceInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.cancelNfseInvoice.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeCancellation(summary) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseBody(nfseInvoiceCancellationSchema, request)),
        }
      },
      pathname: CANCEL_PATH,
      policy: NFSE_CANCEL_POLICY,
    }),
    createDownloadRoute({ dependencies, kind: 'xml', pathname: XML_PATH }),
    createDownloadRoute({ dependencies, kind: 'pdf', pathname: PDF_PATH }),
  ]
}

/** O arquivo sai por URL assinada: o corpo devolve o link, nunca os bytes do documento fiscal. */
function createDownloadRoute(input: {
  readonly dependencies: Dependencies
  readonly kind: 'pdf' | 'xml'
  readonly pathname: string
}): ReturnType<typeof defineRoute> {
  return defineRoute<Omit<DownloadNfseFiscalDocumentInput, 'context'>>({
    async handle({ context, input: parsed }): Promise<Response> {
      const download = await input.dependencies.nfseInvoiceQuery.download({
        context: context.scope,
        ...parsed,
      })
      return jsonResponse({
        body: { data: { expiresAt: download.expiresAt, url: download.url } },
        status: 200,
      })
    },
    method: 'GET',
    parse: ({ pathParameters }) => ({
      invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      kind: input.kind,
    }),
    pathname: input.pathname,
    policy: NFSE_READ_POLICY,
  })
}

function serializeListItem(invoice: NfseInvoiceListItem): object {
  return {
    authorizedAt: invoice.authorizedAt,
    cancelledAt: invoice.cancelledAt,
    createdAt: invoice.createdAt,
    documentCount: invoice.documentCount,
    emissionProfileId: invoice.emissionProfileId,
    id: invoice.id,
    issAmount: invoice.issAmount,
    providerNumber: invoice.providerNumber,
    serviceAmount: invoice.serviceAmount,
    status: invoice.status,
    takerLegalName: invoice.takerLegalName,
    takerTaxId: invoice.takerTaxId,
    updatedAt: invoice.updatedAt,
    verificationCode: invoice.verificationCode,
  }
}

function serializeDetail(invoice: NfseInvoiceDetail): object {
  return {
    ...serializeListItem(invoice),
    cancellationReason: invoice.cancellationReason,
    charges: invoice.charges.map((charge) => ({
      amount: charge.amount,
      baseAmount: charge.baseAmount,
      calculationType: charge.calculationType,
      label: charge.label,
      ordinal: charge.ordinal,
      rate: charge.rate,
    })),
    delivery: invoice.delivery === null ? null : serializeDelivery(invoice.delivery),
    description: invoice.description,
    rejectionCode: invoice.rejectionCode,
    rejectionMessage: invoice.rejectionMessage,
    version: invoice.version,
  }
}

function serializeDelivery(delivery: NfseInvoiceDelivery): object {
  return {
    attemptCount: delivery.attemptCount,
    lastErrorCause: delivery.lastErrorCause,
    lastErrorCode: delivery.lastErrorCode,
    lastErrorMessage: delivery.lastErrorMessage,
    nextAttemptAt: delivery.nextAttemptAt,
    status: delivery.status,
    updatedAt: delivery.updatedAt,
  }
}

function serializeDocument(document: NfseInvoiceLinkedDocument): object {
  return {
    accessKey: document.accessKey,
    cancelledAt: document.cancelledAt,
    documentId: document.documentId,
    issuedAt: document.issuedAt,
    number: document.number,
    position: document.position,
    series: document.series,
    totalAmount: document.totalAmount,
  }
}

function serializeCancellation(summary: NfseInvoiceCancellationSummary): object {
  return {
    attemptId: summary.attemptId,
    invoiceId: summary.invoiceId,
    releasedDocumentIds: summary.releasedDocumentIds,
    replayed: summary.replayed,
    requestedAt: summary.requestedAt,
    status: summary.status,
  }
}

/** A prefeitura é chamada pelo worker: a rota só devolve o aceite do pedido. */
function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeInvoice(invoice: NfseInvoicePreviewItem): object {
  return {
    adjustments: invoice.adjustments.map((adjustment) => ({
      amount: adjustment.amount,
      type: adjustment.type,
    })),
    baseAmount: invoice.baseAmount,
    calculatedAmount: invoice.calculatedAmount,
    charges: invoice.charges.map((charge) => ({
      amount: charge.amount,
      baseAmount: charge.baseAmount,
      calculationType: charge.calculationType,
      label: charge.label,
      rate: charge.rate,
    })),
    description: invoice.description,
    documents: invoice.documents.map((document) => ({
      accessKey: document.accessKey,
      documentId: document.documentId,
      number: document.number,
      series: document.series,
      totalAmount: document.totalAmount,
    })),
    issAmount: invoice.issAmount,
    issRate: invoice.issRate,
    listedDocuments: invoice.listedDocuments,
    omittedDocuments: invoice.omittedDocuments,
    percentage: invoice.percentage,
    profileId: invoice.profileId,
    serviceAmount: invoice.serviceAmount,
    takerLegalName: invoice.takerLegalName,
    takerTaxId: invoice.takerTaxId,
  }
}

function serializeSummary(summary: NfseInvoiceSummary): object {
  return {
    attemptId: summary.attemptId,
    documentIds: summary.documentIds,
    invoiceId: summary.invoiceId,
    replayed: summary.replayed,
    requestedAt: summary.requestedAt,
    status: summary.status,
  }
}
