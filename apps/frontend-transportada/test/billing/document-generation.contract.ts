/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_DOCUMENT_PAGE,
  BILLING_INVOICE_ID,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/billing/shared/billingClient.service'
const DOWNLOAD_MODULE = '../../src/modules/billing/shared/billingDocumentDownload.service'

const GENERATED_DOCUMENT = BILLING_DOCUMENT_PAGE.items[0]
const DOCUMENTS_PATH = `/billing/invoices/${BILLING_INVOICE_ID}/documents`

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** Compara recursivamente os caminhos de chave de string, ignorando os valores traduzidos. */
function collectKeyPaths(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof entry === 'string' ? [path] : collectKeyPaths(entry, path)
  })
}

function createClient(
  factory: BillingClientModule['createBillingClient'],
  respond: (request: Request) => Promise<Response>,
  requests: Request[] = [],
) {
  return factory({
    apiUrl: 'https://api.example.test',
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return respond(request)
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function apiError(input: { readonly code: string; readonly status: number }): Response {
  return Response.json(
    { error: { code: input.code, message: 'Falha sintetica de contrato' } },
    { status: input.status },
  )
}

describe('billing document generation contract', () => {
  test('asks the API to generate the invoice PDF and validates the document it returns', async () => {
    const requests: Request[] = []
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const client = createClient(
      createBillingClient,
      () => Promise.resolve(Response.json({ data: GENERATED_DOCUMENT })),
      requests,
    )

    expect(await client.generateDocument({ invoiceId: BILLING_INVOICE_ID })).toEqual(
      GENERATED_DOCUMENT,
    )

    const [request] = requests
    if (request === undefined) throw new Error('BILLING_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe(`https://api.example.test${DOCUMENTS_PATH}`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
    /** Sem corpo: a rota deriva tudo do path e do contexto autenticado. */
    expect(await request.text()).toBe('')
  })

  test('rejects a generated document that carries storage internals', async () => {
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const client = createClient(createBillingClient, () =>
      Promise.resolve(
        Response.json({ data: { ...GENERATED_DOCUMENT, storageKey: 's3://secret' } }),
      ),
    )

    expect(
      await client
        .generateDocument({ invoiceId: BILLING_INVOICE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_INVALID_DOCUMENTS_RESPONSE' }))
  })

  test('surfaces the API error code of every failure the generation can hit', async () => {
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const failures = [
      { code: 'BILLING_INVOICE_FISCAL_PROFILE_MISSING', status: 422 },
      { code: 'BILLING_INVOICE_NOT_FOUND', status: 404 },
      { code: 'BILLING_INVOICE_DOCUMENT_CONFLICT', status: 409 },
      { code: 'FORBIDDEN', status: 403 },
    ] as const

    for (const failure of failures) {
      const client = createClient(createBillingClient, () => Promise.resolve(apiError(failure)))
      expect(
        await client
          .generateDocument({ invoiceId: BILLING_INVOICE_ID })
          .catch((caught: unknown) => caught),
      ).toEqual(expect.objectContaining({ message: failure.code }))
    }

    const withoutEnvelope = createClient(createBillingClient, () =>
      Promise.resolve(new Response('<html>gateway</html>', { status: 502 })),
    )
    expect(
      await withoutEnvelope
        .generateDocument({ invoiceId: BILLING_INVOICE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_REQUEST_FAILED' }))

    const offline = createClient(createBillingClient, () =>
      Promise.reject(new Error('network down')),
    )
    expect(
      await offline
        .generateDocument({ invoiceId: BILLING_INVOICE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_REQUEST_FAILED' }))
  })

  test('keeps the listing error codes reading the API envelope instead of one generic failure', async () => {
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const client = createClient(createBillingClient, () =>
      Promise.resolve(apiError({ code: 'BILLING_INVOICE_NOT_FOUND', status: 404 })),
    )

    expect(
      await client.getInvoice({ invoiceId: BILLING_INVOICE_ID }).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_INVOICE_NOT_FOUND' }))
  })

  test('maps each known generation failure to its own message key', async () => {
    const { BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY, resolveBillingDocumentMessageKey } =
      await loadFutureModule<BillingDownloadModule>(DOWNLOAD_MODULE)

    expect(
      resolveBillingDocumentMessageKey(new Error('BILLING_INVOICE_FISCAL_PROFILE_MISSING')),
    ).toBe('invoices.documentAction.errors.fiscalProfileMissing')
    expect(resolveBillingDocumentMessageKey(new Error('BILLING_INVOICE_NOT_FOUND'))).toBe(
      'invoices.documentAction.errors.notFound',
    )
    expect(resolveBillingDocumentMessageKey(new Error('BILLING_INVOICE_DOCUMENT_CONFLICT'))).toBe(
      'invoices.documentAction.errors.conflict',
    )
    expect(resolveBillingDocumentMessageKey(new Error('FORBIDDEN'))).toBe(
      'invoices.documentAction.errors.forbidden',
    )
    expect(resolveBillingDocumentMessageKey(new Error('BILLING_FORBIDDEN'))).toBe(
      'invoices.documentAction.errors.forbidden',
    )

    expect(BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY).toBe('invoices.documentAction.errors.unknown')
    expect(resolveBillingDocumentMessageKey(new Error('BILLING_REQUEST_FAILED'))).toBe(
      BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY,
    )
    expect(resolveBillingDocumentMessageKey(null)).toBe(BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY)
    /** A mensagem crua nunca vira texto de tela: o usuário só vê chave traduzida. */
    expect(resolveBillingDocumentMessageKey(new Error('s3://bucket/tenants/company'))).toBe(
      BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY,
    )
  })

  test('keeps one generation in flight at a time and marks only the row being generated', async () => {
    const { resolveBillingDocumentActionState } =
      await loadFutureModule<BillingDownloadModule>(DOWNLOAD_MODULE)
    const otherInvoiceId = '00000000-0000-4000-8000-000000000799'

    expect(
      resolveBillingDocumentActionState({
        canGenerate: true,
        invoiceId: BILLING_INVOICE_ID,
        pendingInvoiceId: null,
      }),
    ).toEqual({ isDisabled: false, isPending: false })
    expect(
      resolveBillingDocumentActionState({
        canGenerate: true,
        invoiceId: BILLING_INVOICE_ID,
        pendingInvoiceId: BILLING_INVOICE_ID,
      }),
    ).toEqual({ isDisabled: true, isPending: true })
    expect(
      resolveBillingDocumentActionState({
        canGenerate: true,
        invoiceId: otherInvoiceId,
        pendingInvoiceId: BILLING_INVOICE_ID,
      }),
    ).toEqual({ isDisabled: true, isPending: false })
    expect(
      resolveBillingDocumentActionState({
        canGenerate: false,
        invoiceId: BILLING_INVOICE_ID,
        pendingInvoiceId: null,
      }),
    ).toEqual({ isDisabled: true, isPending: false })
  })

  test('opens the generated document without keeping the file payload in state', async () => {
    const { createBillingDocumentDownloadController } =
      await loadFutureModule<BillingDownloadModule>(DOWNLOAD_MODULE)
    const openedUrls: string[] = []
    const controller = createBillingDocumentDownloadController({
      openUrl: (url) => openedUrls.push(url),
    })

    controller.openDocument(GENERATED_DOCUMENT)

    expect(openedUrls).toEqual([GENERATED_DOCUMENT.downloadUrl])
    expect(() => controller.openDocument({ documentId: GENERATED_DOCUMENT.documentId })).toThrow(
      'BILLING_INVALID_DOCUMENT',
    )
  })

  test('wires the row action to the generation mutation, its pending row and its error message', async () => {
    const [hook, component] = await Promise.all([
      readModule('src/modules/billing/hooks/useBillingInvoiceTable.hook.ts'),
      readModule('src/modules/billing/components/BillingInvoiceTable.component.tsx'),
    ])

    expect(hook).toContain('generateDocument')
    expect(hook).toContain('pendingDocumentInvoiceId')
    expect(hook).toContain('documentMessageKey')
    expect(hook).toContain('canGenerateDocuments')
    expect(hook).toContain('createBillingDocumentDownloadController')
    expect(hook).toContain('resolveBillingDocumentMessageKey')

    expect(component).toContain('resolveBillingDocumentActionState')
    expect(component).toContain('table.generateDocument')
    expect(component).toContain('table.pendingDocumentInvoiceId')
    expect(component).toContain('table.documentMessageKey')
    expect(component).toContain('invoices.documentAction.generate')
    expect(component).toContain('invoices.documentAction.generating')
    expect(component).toContain('role="alert"')
  })

  test('exposes the document action locale keys with the same shape in pt and en', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readModule('src/modules/billing/locales/billingWorkspace.locale.json'),
      readModule('src/modules/billing/locales/billingWorkspace.en.locale.json'),
    ])
    const ptInvoices = (JSON.parse(ptLocale) as Record<string, unknown>).invoices
    const enInvoices = (JSON.parse(enLocale) as Record<string, unknown>).invoices

    const ptKeyPaths = collectKeyPaths(ptInvoices, '').slice().sort()
    const enKeyPaths = collectKeyPaths(enInvoices, '').slice().sort()
    expect(ptKeyPaths).toEqual(enKeyPaths)
    for (const anchor of [
      'documentAction.generate',
      'documentAction.generating',
      'documentAction.columnHeader',
      'documentAction.errors.conflict',
      'documentAction.errors.fiscalProfileMissing',
      'documentAction.errors.forbidden',
      'documentAction.errors.notFound',
      'documentAction.errors.unknown',
    ]) {
      expect(ptKeyPaths).toContain(anchor)
    }
  })
})

type BillingClientModule = {
  readonly createBillingClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly generateDocument: (input: { readonly invoiceId: string }) => Promise<unknown>
    readonly getInvoice: (input: { readonly invoiceId: string }) => Promise<unknown>
  }
}

type BillingDownloadModule = {
  readonly BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY: string
  readonly createBillingDocumentDownloadController: (input: {
    readonly openUrl: (url: string) => void
  }) => { readonly openDocument: (document: unknown) => void }
  readonly resolveBillingDocumentActionState: (input: {
    readonly canGenerate: boolean
    readonly invoiceId: string
    readonly pendingInvoiceId: null | string
  }) => { readonly isDisabled: boolean; readonly isPending: boolean }
  readonly resolveBillingDocumentMessageKey: (error: unknown) => string
}
