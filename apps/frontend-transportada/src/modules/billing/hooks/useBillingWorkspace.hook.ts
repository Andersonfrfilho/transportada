/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createBillingClient,
  type BillingClient as Client,
  type BillingDocument,
  type BillingInvoiceCreate,
  type BillingInvoiceEdit,
  type BillingInvoiceSummary,
} from '../shared/billingClient.service'
import { createBillingDocumentDownloadController } from '../shared/billingDocumentDownload.service'
import {
  BILLING_DOCUMENTS_QUERY_KEY,
  BILLING_ELIGIBLE_LIST_QUERY_KEY,
  BILLING_INVOICE_LIST_QUERY_KEY,
  BILLING_INVOICE_QUERY_KEY,
} from '../shared/billingQueryKey.constant'

const BILLING_READ = 'billing.read'
const BILLING_CREATE = 'billing.create'
const BILLING_CANCEL = 'billing.cancel'

export type BillingClient = Client

export type BillingController = Readonly<{
  canCancelBilling: boolean
  canCreateBilling: boolean
  canReadBilling: boolean
  cancelInvoice: (
    input: Readonly<{ invoiceId: string; reason: string }>,
  ) => Promise<BillingInvoiceSummary>
  createInvoice: (input: BillingInvoiceCreate) => Promise<BillingInvoiceSummary>
  generateDocument: (input: Readonly<{ invoiceId: string }>) => Promise<BillingDocument>
  updateInvoice: (input: BillingInvoiceEdit) => Promise<BillingInvoiceSummary>
}>

const documentDownload = createBillingDocumentDownloadController({
  openUrl: (url) => {
    if (typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
  },
})

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
    generateDocument: (request) =>
      canCreateBilling ? input.client.generateDocument(request) : forbidden(),
    updateInvoice: (request) =>
      canCreateBilling
        ? input.client.updateInvoice({ ...request, idempotencyKey: createIdempotencyKey() })
        : forbidden(),
  }
}

export function getBillingClient(): BillingClient {
  return createBillingClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useBillingWorkspace(
  input: Readonly<{
    companyId?: string
    invoiceId?: string
    permissions: readonly string[]
  }>,
) {
  const client = getBillingClient()
  const controller = createBillingController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const queryClient = useQueryClient()
  /** A lista de elegiveis é da tabela: aqui só invalidamos o prefixo dela após emitir/cancelar. */
  const eligibleQueryKey = [BILLING_ELIGIBLE_LIST_QUERY_KEY, input.companyId] as const
  const invoiceQueryKey = [BILLING_INVOICE_QUERY_KEY, input.companyId, input.invoiceId] as const
  const invoiceListQueryKey = [BILLING_INVOICE_LIST_QUERY_KEY, input.companyId] as const
  const documentsQueryKey = [BILLING_DOCUMENTS_QUERY_KEY, input.companyId, input.invoiceId] as const

  const invoiceQuery = useQuery({
    enabled: controller.canReadBilling && input.invoiceId !== undefined && input.invoiceId !== '',
    queryFn: () => client.getInvoice({ invoiceId: input.invoiceId ?? '' }),
    queryKey: invoiceQueryKey,
  })
  const documentsQuery = useQuery({
    enabled: controller.canReadBilling && input.invoiceId !== undefined && input.invoiceId !== '',
    queryFn: () => client.listDocuments({ invoiceId: input.invoiceId ?? '' }),
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
  const updateMutation = useMutation({
    mutationFn: controller.updateInvoice,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoiceQueryKey }),
        queryClient.invalidateQueries({ queryKey: invoiceListQueryKey }),
      ])
    },
  })
  /** O PDF novo só aparece na lista do detalhe depois de invalidar os documentos da fatura. */
  const generateDocumentMutation = useMutation({
    mutationFn: () => controller.generateDocument({ invoiceId: input.invoiceId ?? '' }),
    onSuccess: async (document) => {
      documentDownload.openDocument(document)
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey })
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
    generateDocumentMutation,
    invoiceQuery,
    updateMutation,
  }
}
