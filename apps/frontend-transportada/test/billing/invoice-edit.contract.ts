/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CANCELLED_INVOICE,
  BILLING_INVOICE_ID,
  BILLING_ISSUED_INVOICE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const EDIT_SERVICE_PATH = '../../src/modules/billing/shared/billingInvoiceEdit.service'
const DRAFT_SERVICE_PATH = '../../src/modules/billing/shared/billingDraft.service'
const CLIENT_SERVICE_PATH = '../../src/modules/billing/shared/billingClient.service'
const DETAIL_COMPONENT_PATH = 'src/modules/billing/components/BillingInvoiceDetail.component.tsx'
const DETAIL_STYLES_PATH = 'src/modules/billing/styles/billingInvoiceDetail.module.css'
const WORKSPACE_HOOK_MODULE_PATH = '../../src/modules/billing/hooks/useBillingWorkspace.hook'
const WORKSPACE_HOOK_PATH = 'src/modules/billing/hooks/useBillingWorkspace.hook.ts'
const PT_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.locale.json'
const EN_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.en.locale.json'

const OBSERVATIONS = 'Desconto comercial combinado com o tomador'

const REQUIRED_EDIT_KEYS: readonly string[] = [
  'editAmountHint',
  'editCancelled',
  'editDiscount',
  'editDiscountHint',
  'editForbidden',
  'editObservations',
  'editObservationsHint',
  'editSubmit',
  'editSurcharge',
  'editTitle',
  'editTotalPreview',
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
}

function sectionOf(dictionary: Record<string, unknown>, key: string): Record<string, unknown> {
  const section = dictionary[key]
  if (typeof section !== 'object' || section === null) {
    throw new Error('BILLING_INVOICE_EDIT_CONTRACT_LOCALE_MISSING')
  }
  return section as Record<string, unknown>
}

function editStateInput(overrides: Record<string, unknown>): ResolveEditStateInput {
  return {
    canEdit: true,
    discountAmount: '0.00',
    invoiceStatus: BILLING_ISSUED_INVOICE.status,
    isPending: false,
    observations: OBSERVATIONS,
    subtotalAmount: BILLING_ISSUED_INVOICE.subtotalAmount,
    surchargeAmount: '0.00',
    ...overrides,
  }
}

describe('billing invoice edit contract', () => {
  test('normalizes what the operator types into the money the API accepts', async () => {
    const { normalizeBillingAmountInput, BILLING_OBSERVATIONS_MAX_LENGTH } =
      await loadFutureModule<BillingInvoiceEditModule>(EDIT_SERVICE_PATH)

    expect(BILLING_OBSERVATIONS_MAX_LENGTH).toBe(500)
    expect(normalizeBillingAmountInput('10')).toBe('10.00')
    /** Teclado pt-BR manda vírgula: normalizar aqui evita mandar `10,50` para a API. */
    expect(normalizeBillingAmountInput('10,5')).toBe('10.50')
    expect(normalizeBillingAmountInput(' 1234.56 ')).toBe('1234.56')
    expect(normalizeBillingAmountInput('')).toBe('0.00')
    expect(normalizeBillingAmountInput('   ')).toBe('0.00')
    expect(normalizeBillingAmountInput('-1.00')).toBeNull()
    expect(normalizeBillingAmountInput('1.005')).toBeNull()
    expect(normalizeBillingAmountInput('R$ 10,00')).toBeNull()
    expect(normalizeBillingAmountInput('abc')).toBeNull()
  })

  test('recalculates the total on screen as subtotal minus discount plus surcharge', async () => {
    const { resolveBillingInvoiceEditState } =
      await loadFutureModule<BillingInvoiceEditModule>(EDIT_SERVICE_PATH)

    expect(
      resolveBillingInvoiceEditState(
        editStateInput({ discountAmount: '50,50', surchargeAmount: '10.25' }),
      ),
    ).toEqual({ isDisabled: false, messageKey: null, totalAmount: '310.25' })
    expect(resolveBillingInvoiceEditState(editStateInput({}))).toEqual({
      isDisabled: false,
      messageKey: null,
      totalAmount: BILLING_ISSUED_INVOICE.subtotalAmount,
    })
    /** Enquanto o PATCH está no ar o botão trava, mas o total previsto continua visível. */
    expect(resolveBillingInvoiceEditState(editStateInput({ isPending: true }))).toEqual({
      isDisabled: true,
      messageKey: null,
      totalAmount: BILLING_ISSUED_INVOICE.subtotalAmount,
    })
  })

  test('blocks the edition without permission, on a cancelled invoice or with an invalid field', async () => {
    const { resolveBillingInvoiceEditState } =
      await loadFutureModule<BillingInvoiceEditModule>(EDIT_SERVICE_PATH)

    expect(resolveBillingInvoiceEditState(editStateInput({ canEdit: false }))).toEqual({
      isDisabled: true,
      messageKey: 'invoiceDetail.editForbidden',
      totalAmount: BILLING_ISSUED_INVOICE.subtotalAmount,
    })
    expect(
      resolveBillingInvoiceEditState(
        editStateInput({ invoiceStatus: BILLING_CANCELLED_INVOICE.status }),
      ),
    ).toEqual({
      isDisabled: true,
      messageKey: 'invoiceDetail.editCancelled',
      totalAmount: BILLING_ISSUED_INVOICE.subtotalAmount,
    })
    expect(resolveBillingInvoiceEditState(editStateInput({ discountAmount: '-1.00' }))).toEqual({
      isDisabled: true,
      messageKey: 'invoiceDetail.editAmountHint',
      totalAmount: null,
    })
    expect(resolveBillingInvoiceEditState(editStateInput({ surchargeAmount: '1.005' }))).toEqual({
      isDisabled: true,
      messageKey: 'invoiceDetail.editAmountHint',
      totalAmount: null,
    })
    /** Desconto acima do subtotal é o mesmo 422 da API — a tela recusa antes de gastar rede. */
    expect(resolveBillingInvoiceEditState(editStateInput({ discountAmount: '350.51' }))).toEqual({
      isDisabled: true,
      messageKey: 'invoiceDetail.editDiscountHint',
      totalAmount: '-0.01',
    })
    expect(
      resolveBillingInvoiceEditState(editStateInput({ observations: 'a'.repeat(501) })),
    ).toEqual({
      isDisabled: true,
      messageKey: 'invoiceDetail.editObservationsHint',
      totalAmount: BILLING_ISSUED_INVOICE.subtotalAmount,
    })
  })

  test('keeps the edit draft strict and free of tenant or fiscal fields', async () => {
    const { createBillingDrafts } = await loadFutureModule<BillingDraftModule>(DRAFT_SERVICE_PATH)
    const drafts = createBillingDrafts()

    expect(
      drafts.createEditDraft({
        discountAmount: '50,50',
        invoiceId: BILLING_INVOICE_ID,
        observations: `  ${OBSERVATIONS}  `,
        surchargeAmount: '10.25',
      }),
    ).toEqual({
      discountAmount: '50.50',
      invoiceId: BILLING_INVOICE_ID,
      observations: OBSERVATIONS,
      surchargeAmount: '10.25',
    })

    for (const invalidInput of [
      { companyId: 'forbidden-company', invoiceId: BILLING_INVOICE_ID, observations: 'x' },
      { invoiceId: BILLING_INVOICE_ID, totalAmount: '310.25' },
      { invoiceId: BILLING_INVOICE_ID, status: 'cancelled' },
      { discountAmount: '-1.00', invoiceId: BILLING_INVOICE_ID },
      { invoiceId: BILLING_INVOICE_ID, surchargeAmount: '1.005' },
      { invoiceId: BILLING_INVOICE_ID, observations: 'a'.repeat(501) },
      { invoiceId: '', observations: 'x' },
    ]) {
      expect(() => drafts.createEditDraft(invalidInput)).toThrow('BILLING_INVALID_EDIT_DRAFT')
    }
  })

  test('sends the edition as an idempotent PATCH on the invoice resource', async () => {
    const requests: Request[] = []
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(CLIENT_SERVICE_PATH)
    const client = createBillingClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                ...BILLING_ISSUED_INVOICE,
                discountAmount: '50.50',
                observations: OBSERVATIONS,
                surchargeAmount: '10.25',
                totalAmount: '310.25',
              },
            }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
        )
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const updated = await client.updateInvoice({
      discountAmount: '50.50',
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      invoiceId: BILLING_INVOICE_ID,
      observations: OBSERVATIONS,
      surchargeAmount: '10.25',
    })

    expect(updated.totalAmount).toBe('310.25')
    expect(updated.observations).toBe(OBSERVATIONS)
    const [updateRequest] = requests
    if (updateRequest === undefined) throw new Error('BILLING_CONTRACT_REQUEST_MISSING')
    expect(updateRequest.url).toBe(
      `https://api.example.test/billing/invoices/${BILLING_INVOICE_ID}`,
    )
    expect(updateRequest.method).toBe('PATCH')
    expect(updateRequest.cache).toBe('no-store')
    expect(updateRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(updateRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(updateRequest.headers.get('content-type')).toBe('application/json')
    /** O corpo carrega só o que a rota aceita: nada de `invoiceId`, total ou status. */
    expect(await updateRequest.json()).toEqual({
      discountAmount: '50.50',
      observations: OBSERVATIONS,
      surchargeAmount: '10.25',
    })
  })

  test('exposes the edition only to the billing create permission', async () => {
    const { createBillingController } = await loadFutureModule<BillingControllerModule>(
      WORKSPACE_HOOK_MODULE_PATH,
    )
    const calls: Record<string, unknown>[] = []
    const client = {
      updateInvoice: (input: Record<string, unknown>) => {
        calls.push(input)
        return Promise.resolve(BILLING_ISSUED_INVOICE)
      },
    }

    const forbidden = createBillingController({ client, permissions: ['billing.read'] })
    expect(
      await forbidden
        .updateInvoice({ invoiceId: BILLING_INVOICE_ID, observations: OBSERVATIONS })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_FORBIDDEN' }))
    expect(calls).toHaveLength(0)

    const allowed = createBillingController({
      client,
      permissions: ['billing.read', 'billing.create'],
    })
    await allowed.updateInvoice({ invoiceId: BILLING_INVOICE_ID, observations: OBSERVATIONS })
    expect(calls).toHaveLength(1)
    const [updateCall] = calls
    if (updateCall === undefined) throw new Error('BILLING_CONTRACT_REQUEST_MISSING')
    /** A chave de idempotência nasce no controlador: exigimos que exista, não um valor fixo. */
    expect(typeof updateCall.idempotencyKey).toBe('string')
    expect(updateCall.invoiceId).toBe(BILLING_INVOICE_ID)
    expect(updateCall.observations).toBe(OBSERVATIONS)
  })

  test('publishes the edit mutation from the workspace hook and refreshes the invoice', async () => {
    const hook = await readApplicationFile(WORKSPACE_HOOK_PATH)

    expect(hook).toContain('updateInvoice')
    expect(hook).toContain('updateMutation')
    expect(hook).toContain('mutationFn: controller.updateInvoice')
  })

  test('renders the editable panel with the recalculated total inside the detail', async () => {
    const detail = await readApplicationFile(DETAIL_COMPONENT_PATH)
    const stylesheet = await readApplicationFile(DETAIL_STYLES_PATH)

    expect(detail).toContain('resolveBillingInvoiceEditState')
    expect(detail).toContain('createEditDraft')
    expect(detail).toContain('updateMutation')
    expect(detail).toContain('invoiceDetail.editTitle')
    expect(detail).toContain('invoiceDetail.editObservations')
    expect(detail).toContain('invoiceDetail.editDiscount')
    expect(detail).toContain('invoiceDetail.editSurcharge')
    expect(detail).toContain('invoiceDetail.editTotalPreview')
    expect(detail).toContain('invoiceDetail.editSubmit')
    expect(detail).not.toMatch(/<select[\s>]/)
    expect(detail).not.toMatch(/style=\{\{/)
    expect(stylesheet).toContain('min-height: var(--field-height')
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('publishes the edit strings with the same shape in pt and en', async () => {
    const [pt, en] = await Promise.all([readLocale(PT_LOCALE_PATH), readLocale(EN_LOCALE_PATH)])

    for (const dictionary of [pt, en]) {
      const detail = sectionOf(dictionary, 'invoiceDetail')
      for (const key of REQUIRED_EDIT_KEYS) {
        expect(typeof detail[key]).toBe('string')
      }
    }
  })
})

type ResolveEditStateInput = Readonly<{
  canEdit: boolean
  discountAmount: string
  invoiceStatus: string
  isPending: boolean
  observations: string
  subtotalAmount: string
  surchargeAmount: string
}>

type BillingInvoiceEditModule = {
  readonly BILLING_OBSERVATIONS_MAX_LENGTH: number
  readonly normalizeBillingAmountInput: (value: string) => null | string
  readonly resolveBillingInvoiceEditState: (input: ResolveEditStateInput) => Readonly<{
    isDisabled: boolean
    messageKey: null | string
    totalAmount: null | string
  }>
}

type BillingDraftModule = {
  readonly createBillingDrafts: () => {
    readonly createEditDraft: (input: Record<string, unknown>) => Readonly<{
      discountAmount?: string
      invoiceId: string
      observations?: string
      surchargeAmount?: string
    }>
  }
}

type BillingClientModule = {
  readonly createBillingClient: (dependencies: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly updateInvoice: (
      input: Readonly<{
        discountAmount?: string
        idempotencyKey: string
        invoiceId: string
        observations?: string
        surchargeAmount?: string
      }>,
    ) => Promise<Readonly<{ observations: string; totalAmount: string }>>
  }
}

type BillingControllerModule = {
  readonly createBillingController: (input: {
    readonly client: unknown
    readonly permissions: readonly string[]
  }) => {
    readonly updateInvoice: (
      input: Readonly<{
        discountAmount?: string
        invoiceId: string
        observations?: string
        surchargeAmount?: string
      }>,
    ) => Promise<unknown>
  }
}
