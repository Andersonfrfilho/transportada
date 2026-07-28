/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CREATE_REQUEST,
  BILLING_DOCUMENT_PAGE,
  BILLING_ELIGIBLE_PAGE,
  BILLING_INVOICE_ID,
  loadFutureModule,
} from './billing.fixture'

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
