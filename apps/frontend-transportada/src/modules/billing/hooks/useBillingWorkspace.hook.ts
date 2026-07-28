/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createBillingClient,
  type BillingClient as Client,
  type BillingEligibleFilters,
  type BillingInvoiceCreate,
  type BillingInvoiceSummary,
} from '../shared/billingClient.service'

const BILLING_READ = 'billing.read'
const BILLING_CREATE = 'billing.create'
const BILLING_CANCEL = 'billing.cancel'
const BILLING_ELIGIBLE_QUERY_KEY = 'billing-eligible'
const BILLING_INVOICE_QUERY_KEY = 'billing-invoice'
const BILLING_DOCUMENTS_QUERY_KEY = 'billing-documents'

export type BillingClient = Client

export type BillingController = Readonly<{
  canCancelBilling: boolean
  canCreateBilling: boolean
  canReadBilling: boolean
  cancelInvoice: (
    input: Readonly<{ invoiceId: string; reason: string }>,
  ) => Promise<BillingInvoiceSummary>
  createInvoice: (input: BillingInvoiceCreate) => Promise<BillingInvoiceSummary>
}>

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function forbidden(): Promise<never> {
  return Promise.reject(new Error('BILLING_FORBIDDEN'))
}

export function createBillingController(
  input: Readonly<{ client: BillingClient; permissions: readonly string[] }>,
): BillingController {
  const canReadBilling = input.permissions.includes(BILLING_READ)
  const canCreateBilling = input.permissions.includes(BILLING_CREATE)
  const canCancelBilling = input.permissions.includes(BILLING_CANCEL)

  return {
    canCancelBilling,
    canCreateBilling,
    canReadBilling,
    cancelInvoice: (request) =>
      canCancelBilling ? input.client.cancelInvoice(request) : forbidden(),
    createInvoice: (request) =>
      canCreateBilling
        ? input.client.createInvoice({ ...request, idempotencyKey: createIdempotencyKey() })
        : forbidden(),
  }
}

function getBillingClient(): BillingClient {
  return createBillingClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useBillingWorkspace(
  input: Readonly<{
    companyId?: string
    eligibleFilters?: Omit<BillingEligibleFilters, 'limit'>
    permissions: readonly string[]
    selectedInvoiceId?: string
  }>,
) {
  const client = getBillingClient()
  const controller = createBillingController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const queryClient = useQueryClient()
  const eligibleQueryKey = [
    BILLING_ELIGIBLE_QUERY_KEY,
    input.companyId,
    input.eligibleFilters,
  ] as const
  const invoiceQueryKey = [
    BILLING_INVOICE_QUERY_KEY,
    input.companyId,
    input.selectedInvoiceId,
  ] as const
  const documentsQueryKey = [
    BILLING_DOCUMENTS_QUERY_KEY,
    input.companyId,
    input.selectedInvoiceId,
  ] as const

  const eligibleQuery = useQuery({
    enabled: controller.canReadBilling,
    queryFn: () => client.listEligibleCtes({ cursor: null, limit: 25, ...input.eligibleFilters }),
    queryKey: eligibleQueryKey,
  })
  const invoiceQuery = useQuery({
    enabled:
      controller.canReadBilling &&
      input.selectedInvoiceId !== undefined &&
      input.selectedInvoiceId !== '',
    queryFn: () => client.getInvoice({ invoiceId: input.selectedInvoiceId ?? '' }),
    queryKey: invoiceQueryKey,
  })
  const documentsQuery = useQuery({
    enabled:
      controller.canReadBilling &&
      input.selectedInvoiceId !== undefined &&
      input.selectedInvoiceId !== '',
    queryFn: () => client.listDocuments({ invoiceId: input.selectedInvoiceId ?? '' }),
    queryKey: documentsQueryKey,
  })
  const createMutation = useMutation({
    mutationFn: controller.createInvoice,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eligibleQueryKey }),
        queryClient.invalidateQueries({ queryKey: invoiceQueryKey }),
      ])
    },
  })
  const cancelMutation = useMutation({
    mutationFn: controller.cancelInvoice,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eligibleQueryKey }),
        queryClient.invalidateQueries({ queryKey: invoiceQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })

  return {
    cancelMutation,
    controller,
    createMutation,
    documentsQuery,
    eligibleQuery,
    invoiceQuery,
  }
}
