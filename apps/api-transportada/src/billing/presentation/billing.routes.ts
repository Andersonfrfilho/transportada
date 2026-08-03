/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { formatFiscalMoney, isDecimalString } from '../../shared/decimal.service.js'
import {
  API_BILLING_ELIGIBLE_CTES_PATH,
  API_BILLING_INVOICE_PREVIEW_PATH,
  API_BILLING_INVOICES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { BillingEligibleListInput as ParsedBillingEligibleListInput } from './billing.schema.js'
import type { BillingInvoiceListInput as ParsedBillingInvoiceListInput } from './billing.schema.js'
import {
  parseBillingEligibleList,
  parseBillingInvoiceList,
  parseBillingInvoicePreviewRequest,
  parseCancelBillingInvoiceRequest,
  parseCreateBillingInvoiceRequest,
  parseIdempotencyKey,
  parseUpdateBillingInvoiceRequest,
  parseUuidPathIdentifier,
} from './billing.schema.js'

const BILLING_CREATE_POLICY = { permission: 'billing.create', scope: 'company' } as const
const BILLING_CANCEL_POLICY = { permission: 'billing.cancel', scope: 'company' } as const
const BILLING_READ_POLICY = { permission: 'billing.read', scope: 'company' } as const

type WithContext<TInput> = TInput & {
  readonly context: CompanyContext
}

type EligibleBillingCteListInput = ParsedBillingEligibleListInput

type BillingInvoiceListInput = ParsedBillingInvoiceListInput

type CreateBillingInvoiceInput = {
  readonly correlationId: string
  readonly cteIds: readonly string[]
  readonly dueDate: string
  readonly idempotencyKey: string
}

type PreviewBillingInvoiceInput = {
  readonly cteIds: readonly string[]
}

type BillingInvoiceIdentifierInput = {
  readonly invoiceId: string
}

type CancelBillingInvoiceInput = BillingInvoiceIdentifierInput & {
  readonly correlationId: string
  readonly reason: string
}

type UpdateBillingInvoiceInput = BillingInvoiceIdentifierInput & {
  readonly correlationId: string
  readonly discountAmount?: string | undefined
  readonly idempotencyKey: string
  readonly observations?: string | undefined
  readonly surchargeAmount?: string | undefined
}

type BillingSummary = Readonly<Record<string, unknown>>

type BillingDocumentPage = {
  readonly items: readonly BillingSummary[]
  readonly nextCursor: string | null
}

type BillingPreview = {
  readonly blocked: readonly BillingSummary[]
  readonly groups: readonly BillingSummary[]
}

type BillingEligiblePage = BillingDocumentPage

type BillingInvoicePage = BillingDocumentPage

type Dependencies = {
  readonly billingInvoices: {
    readonly cancel: (input: WithContext<CancelBillingInvoiceInput>) => Promise<BillingSummary>
    readonly create: (input: WithContext<CreateBillingInvoiceInput>) => Promise<BillingSummary>
    readonly generateDocument: (
      input: WithContext<BillingInvoiceIdentifierInput>,
    ) => Promise<BillingSummary>
    readonly get: (input: WithContext<BillingInvoiceIdentifierInput>) => Promise<BillingSummary>
    readonly list: (input: WithContext<BillingInvoiceListInput>) => Promise<BillingInvoicePage>
    readonly listDocuments: (
      input: WithContext<BillingInvoiceIdentifierInput>,
    ) => Promise<BillingDocumentPage>
    readonly preview: (input: WithContext<PreviewBillingInvoiceInput>) => Promise<BillingPreview>
    readonly update: (input: WithContext<UpdateBillingInvoiceInput>) => Promise<BillingSummary>
  }
  readonly listEligibleBillingCtes: {
    readonly execute: (
      input: WithContext<EligibleBillingCteListInput>,
    ) => Promise<BillingEligiblePage>
  }
}

export function createBillingRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<EligibleBillingCteListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listEligibleBillingCtes.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items.map(serializeEligibleBillingCte),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseBillingEligibleList(new URL(request.url)),
      pathname: API_BILLING_ELIGIBLE_CTES_PATH,
      policy: BILLING_READ_POLICY,
    }),
    defineRoute<CreateBillingInvoiceInput>({
      async handle({ context, input }): Promise<Response> {
        const invoice = await dependencies.billingInvoices.create({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeInvoice(invoice) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          ...(await parseCreateBillingInvoiceRequest(request)),
        }
      },
      pathname: API_BILLING_INVOICES_PATH,
      policy: BILLING_CREATE_POLICY,
    }),
    defineRoute<PreviewBillingInvoiceInput>({
      async handle({ context, input }): Promise<Response> {
        const preview = await dependencies.billingInvoices.preview({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializePreview(preview) }, status: 200 })
      },
      method: 'POST',
      parse: ({ request }) => parseBillingInvoicePreviewRequest(request),
      pathname: API_BILLING_INVOICE_PREVIEW_PATH,
      policy: BILLING_CREATE_POLICY,
    }),
    defineRoute<BillingInvoiceListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.billingInvoices.list({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items.map(serializeInvoice),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseBillingInvoiceList(new URL(request.url)),
      pathname: API_BILLING_INVOICES_PATH,
      policy: BILLING_READ_POLICY,
    }),
    defineRoute<BillingInvoiceIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const invoice = await dependencies.billingInvoices.get({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeInvoice(invoice) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_BILLING_INVOICES_PATH}/:id`,
      policy: BILLING_READ_POLICY,
    }),
    defineRoute<UpdateBillingInvoiceInput>({
      async handle({ context, input }): Promise<Response> {
        const invoice = await dependencies.billingInvoices.update({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeInvoice(invoice) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseUpdateBillingInvoiceRequest(request)),
        }
      },
      pathname: `${API_BILLING_INVOICES_PATH}/:id`,
      policy: BILLING_CREATE_POLICY,
    }),
    defineRoute<BillingInvoiceIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const document = await dependencies.billingInvoices.generateDocument({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeDocument(document) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_BILLING_INVOICES_PATH}/:id/documents`,
      policy: BILLING_CREATE_POLICY,
    }),
    defineRoute<BillingInvoiceIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.billingInvoices.listDocuments({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items.map(serializeDocument),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_BILLING_INVOICES_PATH}/:id/documents`,
      policy: BILLING_READ_POLICY,
    }),
    defineRoute<CancelBillingInvoiceInput>({
      async handle({ context, input }): Promise<Response> {
        const invoice = await dependencies.billingInvoices.cancel({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeInvoice(invoice) }, status: 200 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          invoiceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          correlationId,
          ...(await parseCancelBillingInvoiceRequest(request)),
        }
      },
      pathname: `${API_BILLING_INVOICES_PATH}/:id/cancel`,
      policy: BILLING_CANCEL_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeEligibleBillingCte(record: BillingSummary): object {
  return {
    batchId: record['batchId'],
    batchName: record['batchName'],
    cteId: record['cteId'] ?? record['id'],
    cteNumber: record['cteNumber'],
    customerDocument: record['customerDocument'],
    customerName: record['customerName'],
    issuedAt: record['issuedAt'] ?? record['authorizedAt'],
    nfeNumber: record['nfeNumber'] ?? null,
    totalAmount: serializeMoney(record['totalAmount']),
  }
}

function serializeMoney(value: unknown): unknown {
  return isDecimalString(value) ? formatFiscalMoney(value) : value
}

function serializePreview(preview: BillingPreview): object {
  return {
    blocked: preview.blocked.map((record) => ({
      cteId: record['cteId'],
      reason: record['reason'],
    })),
    groups: preview.groups.map((group) => ({
      cteCount: group['cteCount'],
      cteIds: group['cteIds'],
      customerDocument: group['customerDocument'],
      customerName: group['customerName'],
      totalAmount: serializeMoney(group['totalAmount']),
    })),
  }
}

function serializeInvoice(invoice: BillingSummary): object {
  return {
    cancelledAt: invoice['cancelledAt'],
    cancellationReason: invoice['cancellationReason'],
    createdAt: invoice['createdAt'],
    customer: {
      document: getCustomerValue(invoice, 'document') ?? invoice['customerDocument'],
      name: getCustomerValue(invoice, 'name') ?? invoice['customerName'],
    },
    discountAmount: serializeMoney(invoice['discountAmount']),
    dueDate: invoice['dueDate'],
    id: invoice['id'],
    invoiceNumber: parseInvoiceNumber(invoice['invoiceNumber']),
    issuedAt: invoice['issuedAt'] ?? invoice['issueDate'],
    itemCount: invoice['itemCount'],
    items: serializeInvoiceItems(invoice['items']),
    observations: invoice['observations'] ?? '',
    status: invoice['status'],
    subtotalAmount: serializeMoney(invoice['subtotalAmount']),
    surchargeAmount: serializeMoney(invoice['surchargeAmount']),
    totalAmount: serializeMoney(invoice['totalAmount']),
    updatedAt: invoice['updatedAt'],
  }
}

/** O detalhe mostra quais CT-es a fatura cobre; nada do snapshot fiscal atravessa a fronteira. */
function serializeInvoiceItems(value: unknown): readonly object[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item: Record<string, unknown>) => ({
    accessKey: item['accessKey'],
    cteNumber: item['cteNumber'],
    description: item['description'],
    totalAmount: serializeMoney(item['totalAmount']),
  }))
}

function getCustomerValue(invoice: BillingSummary, key: 'document' | 'name'): unknown {
  const customer = invoice['customer']
  if (typeof customer !== 'object' || customer === null) return undefined
  return (customer as Readonly<Record<string, unknown>>)[key]
}

function parseInvoiceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]{0,18})$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : undefined
  }
  return undefined
}

function serializeDocument(document: BillingSummary): object {
  return {
    contentType: document['contentType'],
    documentId: document['documentId'],
    documentType: document['documentType'],
    downloadUrl: document['downloadUrl'],
    expiresAt: document['expiresAt'],
    sha256: document['sha256'],
  }
}
