import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  NFSE_CANCEL_PERMISSION,
  NFSE_INVOICE_ERROR,
  NFSE_INVOICE_PAGE_SIZE,
  NFSE_INVOICES_QUERY_KEY,
  NFSE_ISSUE_PERMISSION,
  NFSE_MANAGE_PERMISSION,
  NFSE_READ_PERMISSION,
} from '../shared/nfseInvoice.constant'
import type {
  NfseCancellationSummary,
  NfseDocumentDownload,
  NfseInvoiceDetail,
  NfseInvoiceDocument,
  NfseInvoiceDocumentKind,
  NfseInvoiceFilters,
  NfseInvoicePage,
  NfseInvoicePreview,
  NfseInvoiceSelection,
  NfseIssuanceSummary,
} from '../shared/nfseInvoice.types'
import {
  createNfseInvoiceClient,
  type NfseInvoiceCancellationInput,
  type NfseInvoiceClient,
  type NfseInvoiceListQuery,
} from '../shared/nfseInvoiceClient.service'

export type NfseInvoiceController = Readonly<{
  canCancelInvoices: boolean
  canIssueInvoices: boolean
  canManageInvoices: boolean
  canReadInvoices: boolean
  cancelInvoice: (input: NfseInvoiceCancellationInput) => Promise<NfseCancellationSummary>
  createInvoices: (
    input: NfseInvoiceSelection & Readonly<{ idempotencyKey: string }>,
  ) => Promise<NfseIssuanceSummary>
  getInvoice: (input: Readonly<{ invoiceId: string }>) => Promise<NfseInvoiceDetail>
  getInvoiceDocumentUrl: (
    input: Readonly<{ invoiceId: string; kind: NfseInvoiceDocumentKind }>,
  ) => Promise<NfseDocumentDownload>
  listInvoiceDocuments: (
    input: Readonly<{ invoiceId: string }>,
  ) => Promise<readonly NfseInvoiceDocument[]>
  listInvoices: (input: NfseInvoiceListQuery) => Promise<NfseInvoicePage>
  previewInvoices: (input: NfseInvoiceSelection) => Promise<NfseInvoicePreview>
}>

type ControllerInput = Readonly<{
  client: NfseInvoiceClient
  permissions: readonly string[]
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error(NFSE_INVOICE_ERROR.FORBIDDEN))
}

/** Emitir e cancelar são permissões distintas: quem emite não derruba nota já autorizada. */
export function createNfseInvoiceController(input: ControllerInput): NfseInvoiceController {
  const canReadInvoices = input.permissions.includes(NFSE_READ_PERMISSION)
  const canIssueInvoices = input.permissions.includes(NFSE_ISSUE_PERMISSION)
  const canCancelInvoices = input.permissions.includes(NFSE_CANCEL_PERMISSION)
  const canManageInvoices = input.permissions.includes(NFSE_MANAGE_PERMISSION)

  return {
    canCancelInvoices,
    canIssueInvoices,
    canManageInvoices,
    canReadInvoices,
    cancelInvoice: (query) => (canCancelInvoices ? input.client.cancelInvoice(query) : forbidden()),
    createInvoices: (query) =>
      canIssueInvoices ? input.client.createInvoices(query) : forbidden(),
    getInvoice: (query) => (canReadInvoices ? input.client.getInvoice(query) : forbidden()),
    getInvoiceDocumentUrl: (query) =>
      canReadInvoices ? input.client.getInvoiceDocumentUrl(query) : forbidden(),
    listInvoiceDocuments: (query) =>
      canReadInvoices ? input.client.listInvoiceDocuments(query) : forbidden(),
    listInvoices: (query) => (canReadInvoices ? input.client.listInvoices(query) : forbidden()),
    previewInvoices: (query) =>
      canReadInvoices ? input.client.previewInvoices(query) : forbidden(),
  }
}

export function getNfseInvoiceClient(): NfseInvoiceClient {
  return createNfseInvoiceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

type InvoicesQueryKey = readonly [string, string | undefined, string]

function useNfseInvoiceMutations(
  input: Readonly<{ controller: NfseInvoiceController; invoicesKey: InvoicesQueryKey }>,
) {
  const queryClient = useQueryClient()
  const invalidateInvoices = () => queryClient.invalidateQueries({ queryKey: input.invoicesKey })

  return {
    cancelInvoiceMutation: useMutation({
      mutationFn: input.controller.cancelInvoice,
      onSuccess: invalidateInvoices,
    }),
    createInvoicesMutation: useMutation({
      mutationFn: input.controller.createInvoices,
      onSuccess: invalidateInvoices,
    }),
    previewInvoicesMutation: useMutation({ mutationFn: input.controller.previewInvoices }),
  }
}

function resolveQueryStatus(
  input: Readonly<{ isError: boolean; isPending: boolean }>,
): 'error' | 'loading' | 'success' {
  if (input.isError) return 'error'
  if (input.isPending) return 'loading'
  return 'success'
}

export type NfseInvoicesState = ReturnType<typeof useNfseInvoiceMutations> &
  Readonly<{
    controller: NfseInvoiceController
    invoices: NfseInvoicePage['items']
    nextCursor: null | string
    status: 'error' | 'loading' | 'success'
  }>

export function useNfseInvoices(
  input: Readonly<{
    companyId?: string
    filters?: NfseInvoiceFilters
    permissions: readonly string[]
  }>,
): NfseInvoicesState {
  const filters = input.filters ?? {}
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createNfseInvoiceController({ client: getNfseInvoiceClient(), permissions })
  const invoicesKey = [NFSE_INVOICES_QUERY_KEY, input.companyId, JSON.stringify(filters)] as const
  const invoicesQuery = useQuery({
    enabled: controller.canReadInvoices,
    queryFn: () =>
      controller.listInvoices({ cursor: null, filters, limit: NFSE_INVOICE_PAGE_SIZE }),
    queryKey: invoicesKey,
  })
  const mutations = useNfseInvoiceMutations({ controller, invoicesKey })

  return {
    ...mutations,
    controller,
    invoices: invoicesQuery.data?.items ?? [],
    nextCursor: invoicesQuery.data?.nextCursor ?? null,
    status: resolveQueryStatus({
      isError: invoicesQuery.isError,
      isPending: invoicesQuery.isPending,
    }),
  }
}
