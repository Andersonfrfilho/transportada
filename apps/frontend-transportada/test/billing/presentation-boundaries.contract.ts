/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CREATE_REQUEST,
  BILLING_DOCUMENT_PAGE,
  BILLING_ELIGIBLE_PAGE,
  BILLING_INVOICE_ID,
  loadFutureModule,
} from './billing.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

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

describe('billing presentation boundaries contract', () => {
  test('keeps selection and cancellation drafts strict without tenant selectors or fiscal payload fields', async () => {
    const { createBillingDrafts } = await loadFutureModule<BillingDraftModule>(
      '../../src/modules/billing/shared/billingDraft.service',
    )
    const drafts = createBillingDrafts()

    expect(
      drafts.createInvoiceDraft({
        cteIds: BILLING_CREATE_REQUEST.cteIds,
        dueDate: BILLING_CREATE_REQUEST.dueDate,
      }),
    ).toEqual(BILLING_CREATE_REQUEST)
    expect(
      drafts.createSelectionDraft({
        selectedIds: BILLING_ELIGIBLE_PAGE.items.map((item) => item.cteId),
      }),
    ).toEqual({
      selectedIds: BILLING_ELIGIBLE_PAGE.items.map((item) => item.cteId),
    })
    expect(
      drafts.createCancelDraft({
        invoiceId: BILLING_INVOICE_ID,
        reason: 'Cancelamento operacional por ajuste de cobranca',
      }),
    ).toEqual({
      invoiceId: BILLING_INVOICE_ID,
      reason: 'Cancelamento operacional por ajuste de cobranca',
    })

    expect(() =>
      drafts.createInvoiceDraft({
        companyId: 'forbidden-company',
        cteIds: BILLING_CREATE_REQUEST.cteIds,
        dueDate: BILLING_CREATE_REQUEST.dueDate,
      }),
    ).toThrow('BILLING_INVALID_INVOICE_DRAFT')
    expect(() =>
      drafts.createSelectionDraft({
        selectedIds: BILLING_ELIGIBLE_PAGE.items.map((item) => item.cteId),
        xml: '<cteProc />',
      }),
    ).toThrow('BILLING_INVALID_SELECTION_DRAFT')
    expect(() =>
      drafts.createCancelDraft({
        invoiceId: BILLING_INVOICE_ID,
        reason: '',
      }),
    ).toThrow('BILLING_INVALID_CANCEL_DRAFT')
  })

  test('opens only temporary billing document URLs and never stores file payload in state', async () => {
    const { createBillingDocumentDownloadController } =
      await loadFutureModule<BillingDownloadModule>(
        '../../src/modules/billing/shared/billingDocumentDownload.service',
      )
    const openedUrls: string[] = []
    const controller = createBillingDocumentDownloadController({
      openUrl: (url) => openedUrls.push(url),
    })

    controller.openDocument(BILLING_DOCUMENT_PAGE.items[0])

    expect(openedUrls).toEqual([BILLING_DOCUMENT_PAGE.items[0].downloadUrl])
    expect(JSON.stringify(controller)).not.toContain('storageKey')
    expect(JSON.stringify(controller)).not.toContain('fileContent')
  })

  test('splits the workspace into two design-system tabs, one of them rendering the invoice table', async () => {
    const page = await readModule('src/modules/billing/pages/BillingWorkspace.page.tsx')

    expect(page).toContain('Tabs')
    expect(page).toContain('TabsItem')
    expect(page).toContain("'@/components/ui/tabs'")
    expect(page).toContain('tabs.create')
    expect(page).toContain('tabs.invoices')
    expect(page).toContain('BillingInvoiceTable')
  })

  test('exposes the new tab and invoice-list locale keys with the same shape in pt and en', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readModule('src/modules/billing/locales/billingWorkspace.locale.json'),
      readModule('src/modules/billing/locales/billingWorkspace.en.locale.json'),
    ])
    const ptDictionary = JSON.parse(ptLocale) as Record<string, unknown>
    const enDictionary = JSON.parse(enLocale) as Record<string, unknown>

    expect(ptDictionary.tabs).toBeDefined()
    expect(ptDictionary.invoices).toBeDefined()
    expect(enDictionary.tabs).toBeDefined()
    expect(enDictionary.invoices).toBeDefined()

    const ptTabKeys = collectKeyPaths(ptDictionary.tabs, '').slice().sort()
    const enTabKeys = collectKeyPaths(enDictionary.tabs, '').slice().sort()
    expect(ptTabKeys).toEqual(enTabKeys)
    expect(ptTabKeys).toContain('create')
    expect(ptTabKeys).toContain('invoices')

    const ptInvoiceKeyPaths = collectKeyPaths(ptDictionary.invoices, '').slice().sort()
    const enInvoiceKeyPaths = collectKeyPaths(enDictionary.invoices, '').slice().sort()
    expect(ptInvoiceKeyPaths).toEqual(enInvoiceKeyPaths)
    for (const anchor of [
      'title',
      'empty',
      'resultsCount',
      'clearFilters',
      'selectedCount',
      'columns.invoiceNumber',
      'columns.status',
      'columns.customerName',
      'columns.customerDocument',
      'columns.issuedAt',
      'columns.dueDate',
      'columns.totalAmount',
      'filters.customerDocument',
      'filters.dueFrom',
      'filters.dueTo',
      'filters.invoiceNumber',
      'filters.issuedFrom',
      'filters.issuedTo',
      'filters.status',
    ]) {
      expect(ptInvoiceKeyPaths).toContain(anchor)
    }
  })
})

type BillingDraftModule = {
  readonly createBillingDrafts: () => {
    readonly createCancelDraft: (input: Record<string, unknown>) => {
      readonly invoiceId: string
      readonly reason: string
    }
    readonly createInvoiceDraft: (input: Record<string, unknown>) => typeof BILLING_CREATE_REQUEST
    readonly createSelectionDraft: (input: Record<string, unknown>) => {
      readonly selectedIds: readonly string[]
    }
  }
}

type BillingDownloadModule = {
  readonly createBillingDocumentDownloadController: (input: {
    readonly openUrl: (url: string) => void
  }) => {
    readonly openDocument: (document: unknown) => void
  }
}
