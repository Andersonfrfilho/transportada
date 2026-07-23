/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCteIssuanceClient,
  type CteIssuanceClient as Client,
} from '../shared/cteIssuanceClient.service'

const CTE_SUBMIT = 'cte.submit'
const CTE_ISSUANCE_QUERY_KEY = 'cte-issuance'
const CTE_DOCUMENTS_QUERY_KEY = 'cte-issuance-documents'

export type CteIssuanceClient = Client

export type CteIssuanceController = Readonly<{
  canSubmitCte: boolean
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

  return {
    canSubmitCte,
    issueBatch: (request) =>
      canSubmitCte ? input.client.issueBatch(request).then(() => undefined) : forbidden(),
    reprocessItem: (request) =>
      canSubmitCte ? input.client.reprocessItem(request).then(() => undefined) : forbidden(),
  }
}

function getCteIssuanceClient(): CteIssuanceClient {
  return createCteIssuanceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
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
  const controller = createCteIssuanceController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
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
  const hasSelection = input.batchId !== undefined && input.batchItemId !== undefined

  const issuanceQuery = useQuery({
    enabled: controller.canSubmitCte && hasSelection,
    queryFn: () =>
      client.getIssuance({ batchId: input.batchId ?? '', batchItemId: input.batchItemId ?? '' }),
    queryKey: issuanceQueryKey,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'requested' || status === 'retry_scheduled' ? 5_000 : false
    },
  })
  const documentsQuery = useQuery({
    enabled: controller.canSubmitCte && hasSelection,
    queryFn: () =>
      client.listDocuments({ batchId: input.batchId ?? '', batchItemId: input.batchItemId ?? '' }),
    queryKey: documentsQueryKey,
  })
  const issueMutation = useMutation({
    mutationFn: controller.issueBatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: issuanceQueryKey }),
  })
  const reprocessMutation = useMutation({
    mutationFn: controller.reprocessItem,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: issuanceQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })

  return {
    canSubmitCte: controller.canSubmitCte,
    controller,
    documentsQuery,
    issuanceQuery,
    issueMutation,
    newIdempotencyKey: createIdempotencyKey,
    reprocessMutation,
  }
}
