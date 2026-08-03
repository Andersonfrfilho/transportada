/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createBillingResponseAdapters } from '@/modules/billing/shared/billingResponse.validation'
import { BILLING_INVOICE_ITEMS, BILLING_ISSUED_INVOICE, loadFutureModule } from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const INVOICE_TABLE_SERVICE_PATH = '../../src/modules/billing/shared/billingInvoiceTable.service'
const INVOICE_TABLE_COMPONENT_PATH =
  'src/modules/billing/components/BillingInvoiceTable.component.tsx'
const DETAIL_COMPONENT_PATH = 'src/modules/billing/components/BillingInvoiceDetail.component.tsx'
const PT_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.locale.json'
const EN_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.en.locale.json'

const REQUIRED_ITEM_KEYS: readonly string[] = [
  'itemsAccessKey',
  'itemsAmount',
  'itemsDescription',
  'itemsEmpty',
  'itemsNumber',
  'itemsTitle',
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
    throw new Error('BILLING_INVOICE_ITEMS_CONTRACT_LOCALE_MISSING')
  }
  return section as Record<string, unknown>
}

describe('billing invoice items contract', () => {
  test('accepts the invoice with its linked CT-es and the amount breakdown', () => {
    const adapters = createBillingResponseAdapters()

    const invoice = adapters.invoiceFromApi({ data: BILLING_ISSUED_INVOICE })

    expect(invoice).toEqual(BILLING_ISSUED_INVOICE)
    expect(invoice.items).toEqual(BILLING_INVOICE_ITEMS)
    expect(invoice.itemCount).toBe(2)
    expect(invoice.subtotalAmount).toBe('350.50')
    expect(invoice.discountAmount).toBe('0.00')
    expect(invoice.surchargeAmount).toBe('0.00')
    expect(invoice.observations).toBe('')
  })

  test('rejects an item that is not a CT-e line', () => {
    const adapters = createBillingResponseAdapters()

    /** Valor de item fora do decimal de dinheiro invalida a fatura inteira, não só a linha. */
    expect(() =>
      adapters.invoiceFromApi({
        data: {
          ...BILLING_ISSUED_INVOICE,
          items: [{ ...BILLING_INVOICE_ITEMS[0], totalAmount: 150.25 }],
        },
      }),
    ).toThrow('BILLING_INVALID_INVOICE_RESPONSE')
    expect(() =>
      adapters.invoiceFromApi({
        data: {
          ...BILLING_ISSUED_INVOICE,
          items: [{ ...BILLING_INVOICE_ITEMS[0], snapshot: { xml: '<cteProc />' } }],
        },
      }),
    ).toThrow('BILLING_INVALID_INVOICE_RESPONSE')
  })

  test('publishes the CT-e count as a column of the invoice table', async () => {
    const { BILLING_INVOICE_COLUMN_KEYS } = await loadFutureModule<BillingInvoiceTableModule>(
      INVOICE_TABLE_SERVICE_PATH,
    )
    const table = await readApplicationFile(INVOICE_TABLE_COMPONENT_PATH)

    expect(BILLING_INVOICE_COLUMN_KEYS).toContain('itemCount')
    expect(table).toContain("column === 'itemCount'")
  })

  test('lists the linked CT-es inside the invoice detail', async () => {
    const detail = await readApplicationFile(DETAIL_COMPONENT_PATH)

    expect(detail).toContain('invoiceDetail.itemsTitle')
    expect(detail).toContain('invoiceDetail.itemsEmpty')
    expect(detail).toContain('invoice.items')
    expect(detail).toContain('item.cteNumber')
    expect(detail).toContain('item.accessKey')
    expect(detail).toContain('formatAmount(item.totalAmount)')
    expect(detail).not.toMatch(/style=\{\{/)
  })

  test('publishes the item strings with the same shape in pt and en', async () => {
    const [pt, en] = await Promise.all([readLocale(PT_LOCALE_PATH), readLocale(EN_LOCALE_PATH)])

    for (const dictionary of [pt, en]) {
      const detail = sectionOf(dictionary, 'invoiceDetail')
      for (const key of REQUIRED_ITEM_KEYS) {
        expect(typeof detail[key]).toBe('string')
      }
      const columns = sectionOf(sectionOf(dictionary, 'invoices'), 'columns')
      expect(typeof columns.itemCount).toBe('string')
    }
  })
})

type BillingInvoiceTableModule = {
  readonly BILLING_INVOICE_COLUMN_KEYS: readonly string[]
}
