/**
 * Contrato do vínculo de nota emitida fora do sistema (spec 250, T5.2): a ação só existe para
 * rejeitada/falha com `nfse.issue`, o `id_nota` é só dígitos, e o cliente fala com a rota nova.
 */
import { describe, expect, test } from 'bun:test'

import {
  INVOICE_ID,
  loadFutureModule,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
} from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_URL = 'https://api.example.test'

const ACTIONS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceRowActions.service'
const CLIENT_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceClient.service'
const ADAPTERS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceResponse.validation'
const HOOK_MODULE = '../../src/modules/nfse-invoice/hooks/useNfseInvoices.hook'

const ACTIONS_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceRowActions.component.tsx'
const DIALOG_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceExternalLinkDialog.component.tsx'
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,256}$/

const EXTERNAL_LINK_SUMMARY = {
  attemptId: '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93',
  invoiceId: INVOICE_ID,
  replayed: false,
  status: 'pending_authorization',
} as const

const ALL_STATUSES = [
  'authorized',
  'cancellation_requested',
  'cancelled',
  'discarded',
  'failed',
  'issuing',
  'pending_authorization',
  'rejected',
  'requested',
] as const

type ActionsModule = Readonly<{
  buildNfseExternalLinkIdempotencyKey: (
    input: Readonly<{ invoiceId: string; token: string }>,
  ) => string
  buildNfseDiscardIdempotencyKey: (input: Readonly<{ invoiceId: string; token: string }>) => string
  parseNfseProviderDocumentId: (value: string) => null | string
  resolveNfseRowActions: (
    input: Readonly<{ permissions: readonly string[]; status: string }>,
  ) => Readonly<{ isExternalLinkEnabled: boolean; isExternalLinkVisible: boolean }>
}>

type LinkClient = Readonly<{
  linkExternalInvoice: (
    input: Readonly<{ idempotencyKey: string; invoiceId: string; providerDocumentId: string }>,
  ) => Promise<unknown>
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function collectKeys(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    collectKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

async function readLocaleKeys(filePath: string): Promise<readonly string[]> {
  return collectKeys(JSON.parse(await readApplicationFile(filePath)) as unknown, '')
}

describe('nfse external link availability contract', () => {
  test('offers the link only on rejected or failed, to whoever holds nfse.issue', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)
    const permissions = ['nfse.read', 'nfse.issue']

    for (const status of ALL_STATUSES) {
      const state = actions.resolveNfseRowActions({ permissions, status })
      expect(state.isExternalLinkVisible).toBe(true)
      expect(state.isExternalLinkEnabled).toBe(status === 'rejected' || status === 'failed')
    }
  })

  test('hides the link from whoever lacks nfse.issue, even with cancel', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    for (const permissions of [['nfse.read'], ['nfse.read', 'nfse.cancel']]) {
      const state = actions.resolveNfseRowActions({ permissions, status: 'rejected' })
      expect(state.isExternalLinkVisible).toBe(false)
      expect(state.isExternalLinkEnabled).toBe(false)
    }
  })
})

describe('nfse external link input contract', () => {
  test('accepts only 1 to 20 digits, trimmed', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    expect(actions.parseNfseProviderDocumentId(' 123456 ')).toBe('123456')
    expect(actions.parseNfseProviderDocumentId('1'.repeat(20))).toBe('1'.repeat(20))
    for (const invalid of ['', '   ', 'abc', '12a', '12 34', '-1', '1.5', '1'.repeat(21)]) {
      expect(actions.parseNfseProviderDocumentId(invalid)).toBeNull()
    }
  })

  test('builds an api-acceptable key, stable per attempt and distinct from discard', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)
    const input = { invoiceId: INVOICE_ID, token: '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93' }
    const key = actions.buildNfseExternalLinkIdempotencyKey(input)

    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(actions.buildNfseExternalLinkIdempotencyKey(input)).toBe(key)
    expect(actions.buildNfseDiscardIdempotencyKey(input)).not.toBe(key)
  })
})

describe('nfse external link client contract', () => {
  test('posts the id_nota with the idempotency key and adapts the 202 summary', async () => {
    const requests: Request[] = []
    const { createNfseInvoiceClient } = await loadFutureModule<{
      createNfseInvoiceClient: (dependencies: unknown) => LinkClient
    }>(CLIENT_MODULE)
    const client = createNfseInvoiceClient({
      apiUrl: API_URL,
      fetch: (input: Request) => {
        requests.push(input.clone())
        return Promise.resolve(Response.json({ data: EXTERNAL_LINK_SUMMARY }, { status: 202 }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const summary = await client.linkExternalInvoice({
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      invoiceId: INVOICE_ID,
      providerDocumentId: '987654',
    })

    const [request] = requests
    if (request === undefined) throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    expect(summary).toEqual(EXTERNAL_LINK_SUMMARY)
    expect(request.url).toBe(`${API_URL}/nfse-service-invoices/${INVOICE_ID}/external-link`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(await request.json()).toEqual({ providerDocumentId: '987654' })
  })

  test('the adapter refuses a summary with a missing or extra field', async () => {
    const { createNfseInvoiceResponseAdapters } = await loadFutureModule<{
      createNfseInvoiceResponseAdapters: () => {
        externalLinkSummaryFromApi: (input: unknown) => unknown
      }
    }>(ADAPTERS_MODULE)
    const adapters = createNfseInvoiceResponseAdapters()

    expect(adapters.externalLinkSummaryFromApi(EXTERNAL_LINK_SUMMARY)).toEqual(
      EXTERNAL_LINK_SUMMARY,
    )
    expect(() => adapters.externalLinkSummaryFromApi({ invoiceId: INVOICE_ID })).toThrow()
    expect(() =>
      adapters.externalLinkSummaryFromApi({ ...EXTERNAL_LINK_SUMMARY, companyId: 'x' }),
    ).toThrow()
  })

  test('the controller gates the link on nfse.issue', async () => {
    const { createNfseInvoiceController } = await loadFutureModule<{
      createNfseInvoiceController: (input: unknown) => LinkClient
    }>(HOOK_MODULE)
    const calls: unknown[] = []
    const client = {
      linkExternalInvoice: (input: unknown) => {
        calls.push(input)
        return Promise.resolve(EXTERNAL_LINK_SUMMARY)
      },
    }
    const input = { idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY, invoiceId: INVOICE_ID }
    const withoutIssue = createNfseInvoiceController({
      client,
      permissions: ['nfse.read', 'nfse.cancel'],
    })
    const withIssue = createNfseInvoiceController({ client, permissions: ['nfse.issue'] })

    const outcome = await withoutIssue
      .linkExternalInvoice({ ...input, providerDocumentId: '1' })
      .then(
        () => 'resolved',
        () => 'rejected',
      )
    expect(outcome).toBe('rejected')
    expect(calls).toHaveLength(0)
    await withIssue.linkExternalInvoice({ ...input, providerDocumentId: '1' })
    expect(calls).toHaveLength(1)
  })
})

describe('nfse external link rendering contract', () => {
  test('the row action and the workspace mount the dialog, gated by the pure service', async () => {
    const [actions, page, dialog] = await Promise.all([
      readApplicationFile(ACTIONS_PATH),
      readApplicationFile(PAGE_PATH),
      readApplicationFile(DIALOG_PATH),
    ])

    expect(actions).toContain('state.isExternalLinkVisible')
    expect(actions).toContain('state.isExternalLinkEnabled')
    expect(actions).toContain('rowActions.externalLink')
    expect(page).toContain('<NfseInvoiceExternalLinkDialog')
    expect(dialog).toContain('externalLinkDialog.providerDocumentId')
    expect(dialog).toContain('externalLinkDialog.confirm')
    expect(dialog).not.toContain('<svg')
  })

  test('the two locales declare the same keys for the link', async () => {
    const [portuguese, english] = await Promise.all([
      readLocaleKeys(PT_LOCALE_PATH),
      readLocaleKeys(EN_LOCALE_PATH),
    ])
    const required = [
      'rowActions.externalLink',
      'externalLinkDialog.title',
      'externalLinkDialog.description',
      'externalLinkDialog.providerDocumentId',
      'externalLinkDialog.providerDocumentIdInvalid',
      'externalLinkDialog.confirm',
      'externalLinkDialog.sending',
      'externalLinkDialog.back',
      'externalLinkDialog.close',
      'externalLinkDialog.failed',
      'externalLinkDialog.alreadyLinked',
    ]

    for (const key of required) {
      expect(portuguese).toContain(key)
      expect(english).toContain(key)
    }
  })
})
