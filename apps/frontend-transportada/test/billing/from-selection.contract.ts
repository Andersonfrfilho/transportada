/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CTE_ID_PRIMARY,
  BILLING_CTE_ID_SECONDARY,
  BILLING_ISSUED_INVOICE,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/billing/shared/billingClient.service'
const SELECTION_MODULE = '../../src/modules/billing/shared/billingFromSelection.service'
const DIALOG_HOOK = 'src/modules/cte-batch/hooks/useCteBillingDialog.hook.ts'
const DIALOG_COMPONENT = 'src/modules/cte-batch/components/CteBillingDialog.component.tsx'

const PREVIEW_PATH = '/billing/invoices/preview'
const THIRD_CTE_ID = '00000000-0000-4000-8000-000000000713'
const DUE_DATE = '2026-08-05'

const CUSTOMER_ALFA = { document: '11222333000181', name: 'Cliente Alfa Ltda' } as const
const CUSTOMER_BETA = { document: '44555666000172', name: 'Cliente Beta Ltda' } as const

const PREVIEW_RESPONSE = {
  blocked: [{ cteId: THIRD_CTE_ID, reason: 'already_invoiced' }],
  groups: [
    {
      cteCount: 1,
      cteIds: [BILLING_CTE_ID_PRIMARY],
      customerDocument: CUSTOMER_ALFA.document,
      customerName: CUSTOMER_ALFA.name,
      totalAmount: '150.25',
    },
    {
      cteCount: 1,
      cteIds: [BILLING_CTE_ID_SECONDARY],
      customerDocument: CUSTOMER_BETA.document,
      customerName: CUSTOMER_BETA.name,
      totalAmount: '200.25',
    },
  ],
} as const

type BillingPreviewGroup = Readonly<{
  cteCount: number
  cteIds: readonly string[]
  customerDocument: string
  customerName: string
  totalAmount: string
}>

type BillingPreview = Readonly<{
  blocked: readonly Readonly<{ cteId: string; reason: string }>[]
  groups: readonly BillingPreviewGroup[]
}>

type BillingInvoiceSummary = Readonly<{ id: string; invoiceNumber: number }>

type BillingClientModule = Readonly<{
  createBillingClient: (
    dependencies: Readonly<{
      apiUrl: string
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      getAccessToken: () => Promise<string>
    }>,
  ) => Readonly<{
    createInvoice: (
      input: Readonly<{ cteIds: readonly string[]; dueDate: string; idempotencyKey: string }>,
    ) => Promise<BillingInvoiceSummary>
    previewInvoice: (input: Readonly<{ cteIds: readonly string[] }>) => Promise<BillingPreview>
  }>
}>

type BillingGroupOutcome = Readonly<{
  customerDocument: string
  errorCode?: string
  invoiceNumber?: number
}>

type BillingBlockGroup = Readonly<{ cteIds: readonly string[]; reason: string }>

type BillingFromSelectionModule = Readonly<{
  BILLING_DUE_DATE_ERROR: Readonly<{ INVALID: 'invalid'; REQUIRED: 'required' }>
  groupBillingBlocksByReason: (
    blocks: readonly Readonly<{ cteId: string; reason: string }>[],
  ) => readonly BillingBlockGroup[]
  submitBillingGroups: (
    input: Readonly<{
      client: Readonly<{
        createInvoice: (
          input: Readonly<{ cteIds: readonly string[]; dueDate: string; idempotencyKey: string }>,
        ) => Promise<BillingInvoiceSummary>
      }>
      dueDate: string
      groups: readonly BillingPreviewGroup[]
    }>,
  ) => Promise<readonly BillingGroupOutcome[]>
  validateBillingDueDate: (value: string) => 'invalid' | 'required' | null
}>

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
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

describe('billing from cte selection contract', () => {
  test('asks the API for the grouped preview of the selected CT-es', async () => {
    const requests: Request[] = []
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const client = createClient(
      createBillingClient,
      () => Promise.resolve(Response.json({ data: PREVIEW_RESPONSE })),
      requests,
    )

    expect(
      await client.previewInvoice({ cteIds: [BILLING_CTE_ID_PRIMARY, BILLING_CTE_ID_SECONDARY] }),
    ).toEqual(PREVIEW_RESPONSE)

    const [request] = requests
    if (request === undefined) throw new Error('BILLING_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe(`https://api.example.test${PREVIEW_PATH}`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
    expect(JSON.parse(await request.text()) as unknown).toEqual({
      cteIds: [BILLING_CTE_ID_PRIMARY, BILLING_CTE_ID_SECONDARY],
    })
  })

  test('rejects a preview payload that carries fiscal or storage internals', async () => {
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const client = createClient(createBillingClient, () =>
      Promise.resolve(
        Response.json({
          data: {
            ...PREVIEW_RESPONSE,
            groups: [{ ...PREVIEW_RESPONSE.groups[0], storageKey: 's3://secret' }],
          },
        }),
      ),
    )

    expect(
      await client
        .previewInvoice({ cteIds: [BILLING_CTE_ID_PRIMARY] })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_INVALID_PREVIEW_RESPONSE' }))
  })

  test('surfaces the API error code when the preview is refused', async () => {
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_MODULE)
    const client = createClient(createBillingClient, () =>
      Promise.resolve(
        Response.json(
          { error: { code: 'FORBIDDEN', message: 'Falha sintetica de contrato' } },
          { status: 403 },
        ),
      ),
    )

    expect(
      await client
        .previewInvoice({ cteIds: [BILLING_CTE_ID_PRIMARY] })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FORBIDDEN' }))
  })

  test('requires a due date and refuses anything that is not a calendar date', async () => {
    const { BILLING_DUE_DATE_ERROR, validateBillingDueDate } =
      await loadFutureModule<BillingFromSelectionModule>(SELECTION_MODULE)

    expect(validateBillingDueDate(DUE_DATE)).toBeNull()
    expect(validateBillingDueDate('')).toBe(BILLING_DUE_DATE_ERROR.REQUIRED)
    expect(validateBillingDueDate('   ')).toBe(BILLING_DUE_DATE_ERROR.REQUIRED)
    expect(validateBillingDueDate('05/08/2026')).toBe(BILLING_DUE_DATE_ERROR.INVALID)
    expect(validateBillingDueDate('2026-13-01')).toBe(BILLING_DUE_DATE_ERROR.INVALID)
    expect(validateBillingDueDate('2026-02-30')).toBe(BILLING_DUE_DATE_ERROR.INVALID)
  })

  test('creates one invoice per customer group with a distinct idempotency key', async () => {
    const { submitBillingGroups } =
      await loadFutureModule<BillingFromSelectionModule>(SELECTION_MODULE)

    const calls: { cteIds: readonly string[]; dueDate: string; idempotencyKey: string }[] = []
    const outcomes = await submitBillingGroups({
      client: {
        createInvoice: (input) => {
          calls.push(input)
          return Promise.resolve({
            id: BILLING_ISSUED_INVOICE.id,
            invoiceNumber: calls.length,
          })
        },
      },
      dueDate: DUE_DATE,
      groups: PREVIEW_RESPONSE.groups,
    })

    expect(calls.map((call) => call.cteIds)).toEqual([
      [BILLING_CTE_ID_PRIMARY],
      [BILLING_CTE_ID_SECONDARY],
    ])
    expect(calls.every((call) => call.dueDate === DUE_DATE)).toBeTrue()
    expect(new Set(calls.map((call) => call.idempotencyKey)).size).toBe(2)
    expect(outcomes).toEqual([
      { customerDocument: CUSTOMER_ALFA.document, invoiceNumber: 1 },
      { customerDocument: CUSTOMER_BETA.document, invoiceNumber: 2 },
    ])
  })

  test('keeps the groups that succeeded when one of them is refused', async () => {
    const { submitBillingGroups } =
      await loadFutureModule<BillingFromSelectionModule>(SELECTION_MODULE)

    const outcomes = await submitBillingGroups({
      client: {
        createInvoice: (input) =>
          input.cteIds.includes(BILLING_CTE_ID_SECONDARY)
            ? Promise.reject(new Error('BILLING_CTE_NOT_ELIGIBLE'))
            : Promise.resolve({ id: BILLING_ISSUED_INVOICE.id, invoiceNumber: 17 }),
      },
      dueDate: DUE_DATE,
      groups: PREVIEW_RESPONSE.groups,
    })

    expect(outcomes).toEqual([
      { customerDocument: CUSTOMER_ALFA.document, invoiceNumber: 17 },
      { customerDocument: CUSTOMER_BETA.document, errorCode: 'BILLING_CTE_NOT_ELIGIBLE' },
    ])
  })

  test('invalidates both the CT-e listing and the invoice listing when the dialog finishes', async () => {
    const hook = await readModule(DIALOG_HOOK)

    expect(hook).toContain('submitBillingGroups')
    expect(hook).toContain('validateBillingDueDate')
    expect(hook).toContain('previewInvoice')
    expect(hook).toContain('COMPANY_CTE_ITEMS_QUERY_KEY')
    expect(hook).toContain('BILLING_INVOICE_LIST_QUERY_KEY')
    /** O modal não pode montar requisição HTTP na mão — quem fala com a API é o client do módulo. */
    expect(hook).not.toContain('fetch(')
  })

  test('agrupa os CT-es bloqueados por motivo, preservando a ordem de chegada', async () => {
    const { groupBillingBlocksByReason } =
      await loadFutureModule<BillingFromSelectionModule>(SELECTION_MODULE)

    expect(
      groupBillingBlocksByReason([
        { cteId: THIRD_CTE_ID, reason: 'already_invoiced' },
        { cteId: BILLING_CTE_ID_PRIMARY, reason: 'not_authorized' },
        { cteId: BILLING_CTE_ID_SECONDARY, reason: 'already_invoiced' },
      ]),
    ).toEqual([
      { cteIds: [THIRD_CTE_ID, BILLING_CTE_ID_SECONDARY], reason: 'already_invoiced' },
      { cteIds: [BILLING_CTE_ID_PRIMARY], reason: 'not_authorized' },
    ])
    expect(groupBillingBlocksByReason([])).toEqual([])
  })

  test('o modal de faturamento é acessível e não fala HTTP direto', async () => {
    const dialog = await readModule(DIALOG_COMPONENT)

    expect(dialog).toContain('useCteBillingDialog')
    expect(dialog).toContain('groupBillingBlocksByReason')
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('createPortal')
    /** `<select>` nativo é proibido no design system e o modal não monta requisição na mão. */
    expect(dialog).not.toContain('<select')
    expect(dialog).not.toContain('fetch(')
  })
})
