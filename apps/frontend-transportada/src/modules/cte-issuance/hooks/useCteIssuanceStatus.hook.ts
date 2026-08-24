/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCteIssuanceClient,
  type CteIssuanceClient as Client,
} from '../shared/cteIssuanceClient.service'
import { createCteIssuanceQueryPlan } from '../shared/cteIssuancePolling.service'
import { createCteIssuanceTimeline } from '../shared/cteIssuanceTimeline.service'
import { createCteIssuanceViewModel } from '../shared/cteIssuanceViewModel.service'

const CTE_SUBMIT = 'cte.submit'
const CTE_CANCEL = 'cte.cancel'
const CTE_ISSUANCE_QUERY_KEY = 'cte-issuance'
const CTE_DOCUMENTS_QUERY_KEY = 'cte-issuance-documents'

export type CteIssuanceClient = Client

export type CteIssuanceController = Readonly<{
  canCancelCte: boolean
  canSubmitCte: boolean
  cancelItem: (
    input: Readonly<{
      batchId: string
      batchItemId: string
      idempotencyKey: string
      justification: string
    }>,
  ) => Promise<void>
  issueBatch: (input: Readonly<{ batchId: string; idempotencyKey: string }>) => Promise<void>
  reprocessItem: (
    input: Readonly<{
      batchId: string
      batchItemId: string
      idempotencyKey: string
      reason: string
    }>,
  ) => Promise<void>
}>

type ControllerInput = Readonly<{
  client: CteIssuanceClient
  permissions: readonly string[]
}>

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function forbidden(): Promise<never> {
  return Promise.reject(new Error('CTE_ISSUANCE_FORBIDDEN'))
}

export function createCteIssuanceController(input: ControllerInput): CteIssuanceController {
  const canSubmitCte = input.permissions.includes(CTE_SUBMIT)
  const canCancelCte = input.permissions.includes(CTE_CANCEL)

  return {
    canCancelCte,
    canSubmitCte,
    cancelItem: (request) =>
      canCancelCte ? input.client.cancelItem(request).then(() => undefined) : forbidden(),
    issueBatch: (request) =>
      canSubmitCte ? input.client.issueBatch(request).then(() => undefined) : forbidden(),
    reprocessItem: (request) =>
      canSubmitCte ? input.client.reprocessItem(request).then(() => undefined) : forbidden(),
  }
}

export function getCteIssuanceClient(): CteIssuanceClient {
  return createCteIssuanceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function resolveLoadState(input: {
  readonly isError: boolean
  readonly isSuccess: boolean
}): 'error' | 'loading' | 'success' {
  if (input.isError) return 'error'
  return input.isSuccess ? 'success' : 'loading'
}

export function useCteIssuanceStatus(
  input: Readonly<{
    batchId?: string
    batchItemId?: string
    companyId?: string
    permissions: readonly string[]
  }>,
) {
  const client = getCteIssuanceClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createCteIssuanceController({ client, permissions })
  const queryClient = useQueryClient()
  const issuanceQueryKey = [
    CTE_ISSUANCE_QUERY_KEY,
    input.companyId,
    input.batchId,
    input.batchItemId,
  ] as const
  const documentsQueryKey = [
    CTE_DOCUMENTS_QUERY_KEY,
    input.companyId,
    input.batchId,
    input.batchItemId,
  ] as const
  const selection = {
    ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
    ...(input.batchItemId === undefined ? {} : { batchItemId: input.batchItemId }),
    canSubmitCte: controller.canSubmitCte,
  }

  const issuanceQuery = useQuery({
    enabled: createCteIssuanceQueryPlan(selection).issuanceEnabled,
    queryFn: () =>
      client.getIssuance({ batchId: input.batchId ?? '', batchItemId: input.batchItemId ?? '' }),
    queryKey: issuanceQueryKey,
    refetchInterval: (query) =>
      createCteIssuanceQueryPlan({ ...selection, status: query.state.data?.status })
        .refetchInterval,
  })
  const plan = createCteIssuanceQueryPlan({ ...selection, status: issuanceQuery.data?.status })
  const documentsQuery = useQuery({
    enabled: plan.documentsEnabled,
    queryFn: () =>
      client.listDocuments({ batchId: input.batchId ?? '', batchItemId: input.batchItemId ?? '' }),
    queryKey: documentsQueryKey,
  })
  const issueMutation = useMutation({
    mutationFn: controller.issueBatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: issuanceQueryKey }),
  })
  const cancelMutation = useMutation({
    mutationFn: controller.cancelItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: issuanceQueryKey }),
  })
  const reprocessMutation = useMutation({
    mutationFn: controller.reprocessItem,
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: issuanceQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })
  const viewModel = createCteIssuanceViewModel({
    ...(documentsQuery.data === undefined ? {} : { documents: documentsQuery.data }),
    ...(issuanceQuery.data === undefined ? {} : { issuance: issuanceQuery.data }),
    permissions,
    status: resolveLoadState(issuanceQuery),
  })

  return {
    canCancelCte: controller.canCancelCte,
    canSubmitCte: controller.canSubmitCte,
    cancelMutation,
    controller,
    documentsQuery,
    hasSelection: plan.issuanceEnabled,
    issuanceQuery,
    issueMutation,
    newIdempotencyKey: createIdempotencyKey,
    reprocessMutation,
    timeline: createCteIssuanceTimeline({ issuance: issuanceQuery.data }),
    viewModel,
  }
}
