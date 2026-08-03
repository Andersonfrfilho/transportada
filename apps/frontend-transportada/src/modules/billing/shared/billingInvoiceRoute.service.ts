/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

export const BILLING_INVOICES_ROUTE = '/billing'
export const BILLING_INVOICE_ROUTE_PREFIX = '/billing/invoices/'
export const BILLING_WORKSPACE = 'billing'

export function buildBillingInvoiceRoute(invoiceId: string): string {
  return `${BILLING_INVOICE_ROUTE_PREFIX}${encodeURIComponent(invoiceId)}`
}

/** Devolve a fatura da rota, ou `null` quando o caminho é outro — inclusive a própria lista. */
export function parseBillingInvoiceRoute(pathname: string): null | string {
  if (!pathname.startsWith(BILLING_INVOICE_ROUTE_PREFIX)) return null

  const remainder = pathname.slice(BILLING_INVOICE_ROUTE_PREFIX.length).replace(/\/$/, '')
  if (remainder === '' || remainder.includes('/')) return null

  return decodeURIComponent(remainder)
}

export function navigateToBillingInvoice(
  input: Readonly<{ invoiceId: string; navigator: WorkspaceNavigator }>,
): void {
  input.navigator.pushPath(buildBillingInvoiceRoute(input.invoiceId))
  input.navigator.rememberWorkspace(BILLING_WORKSPACE)
  input.navigator.dispatchPopState()
}

export function navigateToBillingInvoices(navigator: WorkspaceNavigator): void {
  navigator.pushPath(BILLING_INVOICES_ROUTE)
  navigator.rememberWorkspace(BILLING_WORKSPACE)
  navigator.dispatchPopState()
}
