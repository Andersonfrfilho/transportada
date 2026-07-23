/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CANCEL,
  BILLING_CREATE,
  BILLING_DOCUMENT_PAGE,
  BILLING_ELIGIBLE_PAGE,
  BILLING_ISSUED_INVOICE,
  BILLING_READ,
  loadFutureModule,
} from './billing.fixture'

describe('billing permissions and states contract', () => {
  test('only exposes selection, creation and cancellation actions to billing permissions', async () => {
    const { createBillingController } = await loadFutureModule<BillingHookModule>(
      '../../src/modules/billing/hooks/useBillingWorkspace.hook',
    )
    const client = createMutationRecordingClient()

    const forbiddenController = createBillingController({ client, permissions: [] })
    expect(forbiddenController.canReadBilling).toBe(false)
    expect(forbiddenController.canCreateBilling).toBe(false)
    expect(forbiddenController.canCancelBilling).toBe(false)
    expect(
      await forbiddenController
        .createInvoice({
          cteIds: [BILLING_ELIGIBLE_PAGE.items[0].cteId],
          dueDate: BILLING_ISSUED_INVOICE.dueDate,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_FORBIDDEN' }))
    expect(
      await forbiddenController
        .cancelInvoice({
          invoiceId: BILLING_ISSUED_INVOICE.id,
          reason: 'Cancelamento operacional por ajuste de cobranca',
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'BILLING_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const readerController = createBillingController({ client, permissions: [BILLING_READ] })
    expect(readerController.canReadBilling).toBe(true)
    expect(readerController.canCreateBilling).toBe(false)
    expect(readerController.canCancelBilling).toBe(false)

    const financeController = createBillingController({
      client,
      permissions: [BILLING_READ, BILLING_CREATE, BILLING_CANCEL],
    })
    expect(financeController.canReadBilling).toBe(true)
    expect(financeController.canCreateBilling).toBe(true)
    expect(financeController.canCancelBilling).toBe(true)
  })

  test('maps forbidden, empty, selectable, issued and cancelled states without XML persistence', async () => {
    const { createBillingViewModel } = await loadFutureModule<BillingViewModelModule>(
      '../../src/modules/billing/shared/billingViewModel.service',
    )

    expect(
      createBillingViewModel({
        documents: BILLING_DOCUMENT_PAGE,
        eligible: BILLING_ELIGIBLE_PAGE,
        invoice: BILLING_ISSUED_INVOICE,
        permissions: [],
        status: 'success',
      }),
    ).toEqual({
      canCancelBilling: false,
      canCreateBilling: false,
      canDownloadBillingDocument: false,
      status: 'forbidden',
    })

    expect(
      createBillingViewModel({
        documents: { items: [], nextCursor: null },
        eligible: { items: [], nextCursor: null },
        permissions: [BILLING_READ, BILLING_CREATE],
        status: 'success',
      }),
    ).toEqual({
      canCancelBilling: false,
      canCreateBilling: true,
      canDownloadBillingDocument: false,
      status: 'empty',
    })

    const selectable = createBillingViewModel({
      documents: { items: [], nextCursor: null },
      eligible: BILLING_ELIGIBLE_PAGE,
      permissions: [BILLING_READ, BILLING_CREATE],
      status: 'success',
    })
    expect(selectable.status).toBe('selectable')
    expect(selectable.selectedCustomerDocument).toBe('12345678000199')
    expect(selectable.selectableCount).toBe(2)

    const issued = createBillingViewModel({
      documents: BILLING_DOCUMENT_PAGE,
      eligible: BILLING_ELIGIBLE_PAGE,
      invoice: BILLING_ISSUED_INVOICE,
      permissions: [BILLING_READ, BILLING_CREATE, BILLING_CANCEL],
      status: 'success',
    })
    expect(issued.status).toBe('issued')
    expect(issued.canCancelBilling).toBe(true)
    expect(issued.canDownloadBillingDocument).toBe(true)
    expect(JSON.stringify(issued)).not.toContain('<cteProc')

    const cancelled = createBillingViewModel({
      documents: BILLING_DOCUMENT_PAGE,
      eligible: BILLING_ELIGIBLE_PAGE,
      invoice: { ...BILLING_ISSUED_INVOICE, status: 'cancelled' },
      permissions: [BILLING_READ, BILLING_CREATE, BILLING_CANCEL],
      status: 'success',
    })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.canCancelBilling).toBe(false)
    expect(cancelled.canDownloadBillingDocument).toBe(true)
  })
})

function createMutationRecordingClient(): BillingClient & { readonly mutationCount: number } {
  let mutationCount = 0

  return {
    cancelInvoice: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    createInvoice: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    get mutationCount(): number {
      return mutationCount
    },
    getInvoice: () => Promise.resolve(BILLING_ISSUED_INVOICE),
    listDocuments: () => Promise.resolve(BILLING_DOCUMENT_PAGE),
    listEligibleCtes: () => Promise.resolve(BILLING_ELIGIBLE_PAGE),
  }
}

type BillingClient = {
  cancelInvoice(input: { readonly invoiceId: string; readonly reason: string }): Promise<unknown>
  createInvoice(input: {
    readonly cteIds: readonly string[]
    readonly dueDate: string
  }): Promise<unknown>
  getInvoice(input: { readonly invoiceId: string }): Promise<unknown>
  listDocuments(input: { readonly invoiceId: string }): Promise<unknown>
  listEligibleCtes(input: Record<string, unknown>): Promise<unknown>
}

type BillingHookModule = {
  readonly createBillingController: (input: {
    readonly client: BillingClient
    readonly permissions: readonly string[]
  }) => {
    readonly canCancelBilling: boolean
    readonly canCreateBilling: boolean
    readonly canReadBilling: boolean
    readonly cancelInvoice: (input: {
      readonly invoiceId: string
      readonly reason: string
    }) => Promise<void>
    readonly createInvoice: (input: {
      readonly cteIds: readonly string[]
      readonly dueDate: string
    }) => Promise<void>
  }
}

type BillingViewModel = {
  readonly canCancelBilling: boolean
  readonly canCreateBilling: boolean
  readonly canDownloadBillingDocument: boolean
  readonly selectableCount?: number
  readonly selectedCustomerDocument?: string
  readonly status:
    | 'cancelled'
    | 'empty'
    | 'error'
    | 'forbidden'
    | 'issued'
    | 'loading'
    | 'selectable'
}

type BillingViewModelModule = {
  readonly createBillingViewModel: (input: {
    readonly documents?: unknown
    readonly eligible?: unknown
    readonly invoice?: unknown
    readonly permissions: readonly string[]
    readonly status: 'error' | 'loading' | 'success'
  }) => BillingViewModel
}
