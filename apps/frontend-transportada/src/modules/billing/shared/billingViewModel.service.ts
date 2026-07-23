/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  BillingDocumentPage,
  BillingEligiblePage,
  BillingInvoiceSummary,
} from './billingClient.service'

export type BillingViewModel = Readonly<{
  canCancelBilling: boolean
  canCreateBilling: boolean
  canDownloadBillingDocument: boolean
  selectableCount?: number
  selectedCustomerDocument?: string
  status: 'cancelled' | 'empty' | 'error' | 'forbidden' | 'issued' | 'loading' | 'selectable'
}>

type ViewModelInput = Readonly<{
  documents?: BillingDocumentPage
  eligible?: BillingEligiblePage
  invoice?: BillingInvoiceSummary
  permissions: readonly string[]
  status: 'error' | 'loading' | 'success'
}>

const BILLING_READ = 'billing.read'
const BILLING_CREATE = 'billing.create'
const BILLING_CANCEL = 'billing.cancel'

export function createBillingViewModel(input: ViewModelInput): BillingViewModel {
  const canReadBilling = input.permissions.includes(BILLING_READ)
  const canCreateBilling = input.permissions.includes(BILLING_CREATE)
  const canCancelBilling = input.permissions.includes(BILLING_CANCEL)

  if (!canReadBilling) {
    return {
      canCancelBilling: false,
      canCreateBilling: false,
      canDownloadBillingDocument: false,
      status: 'forbidden',
    }
  }
  if (input.status !== 'success') {
    return {
      canCancelBilling,
      canCreateBilling,
      canDownloadBillingDocument: false,
      status: input.status,
    }
  }

  const eligible = input.eligible?.items ?? []
  const invoice = input.invoice
  const documents = input.documents?.items ?? []
  if (invoice?.status === 'cancelled') {
    return {
      canCancelBilling: false,
      canCreateBilling,
      canDownloadBillingDocument: documents.length > 0,
      status: 'cancelled',
    }
  }
  if (invoice?.status === 'issued') {
    return {
      canCancelBilling,
      canCreateBilling,
      canDownloadBillingDocument: documents.length > 0,
      status: 'issued',
    }
  }
  if (eligible.length > 0) {
    return {
      canCancelBilling: false,
      canCreateBilling,
      canDownloadBillingDocument: false,
      selectableCount: eligible.length,
      ...(eligible[0]?.customerDocument === undefined
        ? {}
        : { selectedCustomerDocument: eligible[0].customerDocument }),
      status: 'selectable',
    }
  }
  return {
    canCancelBilling: false,
    canCreateBilling,
    canDownloadBillingDocument: false,
    status: 'empty',
  }
}
