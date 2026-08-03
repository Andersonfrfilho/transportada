/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CANCELLED_INVOICE,
  BILLING_ISSUED_INVOICE,
  loadFutureModule,
} from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const DETAIL_SERVICE_PATH = '../../src/modules/billing/shared/billingInvoiceDetail.service'
const DETAIL_COMPONENT_PATH = 'src/modules/billing/components/BillingInvoiceDetail.component.tsx'
const DETAIL_STYLES_PATH = 'src/modules/billing/styles/billingInvoiceDetail.module.css'
const INVOICE_TABLE_COMPONENT_PATH =
  'src/modules/billing/components/BillingInvoiceTable.component.tsx'
const INVOICE_TABLE_HOOK_PATH = 'src/modules/billing/hooks/useBillingInvoiceTable.hook.ts'
const WORKSPACE_HOOK_PATH = 'src/modules/billing/hooks/useBillingWorkspace.hook.ts'
const DETAIL_PAGE_PATH = 'src/modules/billing/pages/BillingInvoiceDetail.page.tsx'
const PT_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.locale.json'
const EN_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.en.locale.json'

const REQUIRED_DETAIL_KEYS: readonly string[] = [
  'cancelAlready',
  'cancelForbidden',
  'cancelReason',
  'cancelReasonHint',
  'cancelSubmit',
  'cancelTitle',
  'close',
  'customer',
  'document',
  'documentsEmpty',
  'documentsTitle',
  'download',
  'dueDate',
  'empty',
  'issuedAt',
  'number',
  'statusValue',
  'title',
  'total',
]

const VALID_REASON = 'Cancelamento operacional por ajuste de cobranca'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function keyPathsOf(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof entry === 'string' ? [path] : keyPathsOf(entry, path)
  })
}

async function readLocaleSection(filePath: string): Promise<Record<string, unknown>> {
  const dictionary = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  const detail = dictionary.invoiceDetail
  if (typeof detail !== 'object' || detail === null) {
    throw new Error('BILLING_INVOICE_DETAIL_CONTRACT_LOCALE_MISSING')
  }
  return detail as Record<string, unknown>
}

describe('billing invoice detail contract', () => {
  test('blocks the cancellation without permission, without reason or on an already cancelled invoice', async () => {
    const { resolveBillingCancellationState, BILLING_CANCEL_REASON_MIN_LENGTH } =
      await loadFutureModule<BillingInvoiceDetailModule>(DETAIL_SERVICE_PATH)

    expect(BILLING_CANCEL_REASON_MIN_LENGTH).toBe(3)
    expect(
      resolveBillingCancellationState({
        canCancel: false,
        invoiceStatus: BILLING_ISSUED_INVOICE.status,
        isPending: false,
        reason: VALID_REASON,
      }),
    ).toEqual({ isDisabled: true, messageKey: 'invoiceDetail.cancelForbidden' })
    expect(
      resolveBillingCancellationState({
        canCancel: true,
        invoiceStatus: BILLING_CANCELLED_INVOICE.status,
        isPending: false,
        reason: VALID_REASON,
      }),
    ).toEqual({ isDisabled: true, messageKey: 'invoiceDetail.cancelAlready' })
    expect(
      resolveBillingCancellationState({
        canCancel: true,
        invoiceStatus: BILLING_ISSUED_INVOICE.status,
        isPending: false,
        reason: '  a  ',
      }),
    ).toEqual({ isDisabled: true, messageKey: 'invoiceDetail.cancelReasonHint' })
  })

  test('releases the cancellation only with permission, reason and no request in flight', async () => {
    const { resolveBillingCancellationState } =
      await loadFutureModule<BillingInvoiceDetailModule>(DETAIL_SERVICE_PATH)

    expect(
      resolveBillingCancellationState({
        canCancel: true,
        invoiceStatus: BILLING_ISSUED_INVOICE.status,
        isPending: false,
        reason: VALID_REASON,
      }),
    ).toEqual({ isDisabled: false, messageKey: null })
    expect(
      resolveBillingCancellationState({
        canCancel: true,
        invoiceStatus: BILLING_ISSUED_INVOICE.status,
        isPending: true,
        reason: VALID_REASON,
      }),
    ).toEqual({ isDisabled: true, messageKey: null })
    /** Três caracteres úteis já bastam: a regra é a mesma de `createCancelDraft`. */
    expect(
      resolveBillingCancellationState({
        canCancel: true,
        invoiceStatus: BILLING_ISSUED_INVOICE.status,
        isPending: false,
        reason: ' abc ',
      }),
    ).toEqual({ isDisabled: false, messageKey: null })
  })

  test('opens the invoice from a row of the issued table instead of a typed identifier', async () => {
    const [hook, table] = await Promise.all([
      readApplicationFile(INVOICE_TABLE_HOOK_PATH),
      readApplicationFile(INVOICE_TABLE_COMPONENT_PATH),
    ])

    expect(hook).toContain('openInvoice')
    expect(table).toContain('table.openInvoice(item.id)')
    expect(table).toContain('invoices.openDetail')
  })

  test('opens the detail from anywhere in the row without swallowing the row controls', async () => {
    const table = await readApplicationFile(INVOICE_TABLE_COMPONENT_PATH)

    expect(table).toContain('onClick={() => table.openInvoice(item.id)}')
    expect(table).toContain('className={styles.dataRow}')
    expect(table).toContain('stopRowPropagation')
    expect(table).toContain('function stopRowPropagation(')
  })

  test('generates and downloads the invoice document from the detail panel', async () => {
    const [detail, workspaceHook, ptLocale, enLocale] = await Promise.all([
      readApplicationFile(DETAIL_COMPONENT_PATH),
      readApplicationFile(WORKSPACE_HOOK_PATH),
      readApplicationFile(PT_LOCALE_PATH),
      readApplicationFile(EN_LOCALE_PATH),
    ])

    expect(workspaceHook).toContain('generateDocumentMutation')
    expect(workspaceHook).toContain('documentsQueryKey')
    expect(detail).toContain('workspace.generateDocumentMutation')
    expect(detail).toContain('invoiceDetail.generateDocument')
    for (const locale of [ptLocale, enLocale]) {
      const invoiceDetail = (JSON.parse(locale) as { invoiceDetail: Record<string, unknown> })
        .invoiceDetail
      expect(typeof invoiceDetail['generateDocument']).toBe('string')
      expect(typeof invoiceDetail['generatingDocument']).toBe('string')
    }
  })

  test('shows the invoice, its documents and the cancellation in a single detail panel', async () => {
    const detail = await readApplicationFile(DETAIL_COMPONENT_PATH)

    expect(detail).toContain('export function BillingInvoiceDetail(')
    expect(detail).toContain('useTranslation')
    expect(detail).toContain('resolveBillingCancellationState')
    expect(detail).toContain('formatAmount')
    expect(detail).toContain('invoiceDetail.number')
    expect(detail).toContain('invoiceDetail.customer')
    expect(detail).toContain('invoiceDetail.total')
    expect(detail).toContain('invoiceDetail.statusValue')
    expect(detail).toContain('invoiceDetail.documentsTitle')
    expect(detail).toContain('invoiceDetail.download')
    expect(detail).toContain('invoiceDetail.cancelReason')
    expect(detail).toContain('invoiceDetail.cancelSubmit')
    expect(detail).toContain('createBillingDocumentDownloadController')
  })

  test('closes the panel from its own control and keeps it on tokens instead of inline style', async () => {
    const detail = await readApplicationFile(DETAIL_COMPONENT_PATH)
    const stylesheet = await readApplicationFile(DETAIL_STYLES_PATH)

    expect(detail).toContain('invoiceDetail.close')
    expect(detail).toContain("from '../styles/billingInvoiceDetail.module.css'")
    expect(detail).not.toMatch(/<select[\s>]/)
    expect(detail).not.toMatch(/style=\{\{/)
    expect(detail).not.toContain('type="date"')
    expect(stylesheet).toContain('min-height: var(--field-height')
    expect(stylesheet).toContain('var(--space-')
    expect(stylesheet).not.toContain('min(100% -')
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('drops the invoice identifier box and the loose cancel and documents panels from the page', async () => {
    const page = await readApplicationFile(DETAIL_PAGE_PATH)

    expect(page).toContain('BillingInvoiceDetail')
    expect(page).not.toContain('selectedInvoiceId')
    expect(page).not.toContain('setCancelReason')
    expect(page).not.toContain('invoice.lookup')
    expect(page).not.toContain('cancel.submit')
    expect(page).not.toContain('documents.title')
    expect(page).not.toContain('documents.download')
  })

  test('publishes the detail strings with the same shape in pt and en and retires the old sections', async () => {
    const [ptDetail, enDetail] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH),
      readLocaleSection(EN_LOCALE_PATH),
    ])

    const ptKeyPaths = keyPathsOf(ptDetail, '').slice().sort()
    const enKeyPaths = keyPathsOf(enDetail, '').slice().sort()
    expect(ptKeyPaths).toEqual(enKeyPaths)
    for (const key of REQUIRED_DETAIL_KEYS) {
      expect(ptKeyPaths).toContain(key)
    }

    for (const localePath of [PT_LOCALE_PATH, EN_LOCALE_PATH]) {
      const dictionary = JSON.parse(await readApplicationFile(localePath)) as Record<
        string,
        unknown
      >
      expect(dictionary.invoice).toBeUndefined()
      expect(dictionary.cancel).toBeUndefined()
      expect(dictionary.documents).toBeUndefined()
      const invoices = dictionary.invoices as Record<string, unknown>
      expect(typeof invoices.openDetail).toBe('string')
    }
  })
})

type BillingInvoiceDetailModule = {
  readonly BILLING_CANCEL_REASON_MIN_LENGTH: number
  readonly resolveBillingCancellationState: (
    input: Readonly<{
      canCancel: boolean
      invoiceStatus: string
      isPending: boolean
      reason: string
    }>,
  ) => Readonly<{ isDisabled: boolean; messageKey: null | string }>
}
