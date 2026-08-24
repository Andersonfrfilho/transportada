/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  createCteBatchClient,
  type CteBatchClient as Client,
  type CteBatchCreate,
  type CteBatchFilters,
} from '../shared/cteBatchClient.service'
import { resolveCteBatchProgressInterval } from '../shared/cteBatchProgress.service'

const CTE_MANAGE = 'cte.manage'
const CTE_SUBMIT = 'cte.submit'
export const CTE_BATCHES_QUERY_KEY = 'cte-batches'
const CTE_BATCH_EVENTS_QUERY_KEY = 'cte-batch-events'

export type CteBatchClient = Client

export type CteBatchController = Readonly<{
  canManageBatches: boolean
  canSubmitBatches: boolean
  cancelBatch: (batchId: string) => ReturnType<CteBatchClient['cancelBatch']>
  createBatch: (input: CteBatchCreate) => ReturnType<CteBatchClient['createBatch']>
  removeItem: (
    input: Readonly<{ batchId: string; itemId: string }>,
  ) => ReturnType<CteBatchClient['removeItem']>
}>

type ControllerInput = Readonly<{
  client: CteBatchClient
  permissions: readonly string[]
}>

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function forbidden(): Promise<never> {
  return Promise.reject(new Error('CTE_BATCH_FORBIDDEN'))
}

export function createCteBatchController(input: ControllerInput): CteBatchController {
  const canManageBatches = input.permissions.includes(CTE_MANAGE)
  const canSubmitBatches = input.permissions.includes(CTE_SUBMIT)

  return {
    canManageBatches,
    canSubmitBatches,
    cancelBatch: (batchId) => (canManageBatches ? input.client.cancelBatch(batchId) : forbidden()),
    createBatch: (request) => (canManageBatches ? input.client.createBatch(request) : forbidden()),
    removeItem: (request) => (canManageBatches ? input.client.removeItem(request) : forbidden()),
  }
}

export function getCteBatchClient(): CteBatchClient {
  return createCteBatchClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: createIdempotencyKey,
    newSubmitIdempotencyKey: createIdempotencyKey,
  })
}

export function useCteBatchWorkspace(
  input: Readonly<{
    batchId?: string
    companyId?: string
    filters?: CteBatchFilters
    permissions: readonly string[]
  }>,
) {
  const client = getCteBatchClient()
  const controller = createCteBatchController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const queryClient = useQueryClient()
  const batchesQueryKey = [CTE_BATCHES_QUERY_KEY, input.companyId, input.filters] as const
  const eventsQueryKey = [CTE_BATCH_EVENTS_QUERY_KEY, input.companyId, input.batchId] as const

  const batchesQuery = useQuery({
    enabled: controller.canSubmitBatches || controller.canManageBatches,
    queryFn: () =>
      client.listBatches({
        cursor: null,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
        limit: 25,
      }),
    queryKey: batchesQueryKey,
    /** Depois de transmitir, quem fecha o lote é o worker — a listagem acompanha sem F5. */
    refetchInterval: (query) => resolveCteBatchProgressInterval(query.state.data),
  })
  const eventsQuery = useQuery({
    enabled:
      input.batchId !== undefined && (controller.canSubmitBatches || controller.canManageBatches),
    queryFn: () =>
      client.listEvents({
        batchId: input.batchId ?? '',
        cursor: null,
        limit: 25,
      }),
    queryKey: eventsQueryKey,
  })
  const createBatchMutation = useMutation({
    mutationFn: controller.createBatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: batchesQueryKey }),
  })
  // O lote cancelado sai do recorte de vínculo ativo: todas as notas dele voltam a ser livres.
  const cancelBatchMutation = useMutation({
    mutationFn: controller.cancelBatch,
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: batchesQueryKey }),
        invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient }),
      ])
    },
  })

  return {
    batchesQuery,
    canManageBatches: controller.canManageBatches,
    canSubmitBatches: controller.canSubmitBatches,
    cancelBatchMutation,
    controller,
    createBatchMutation,
    eventsQuery,
    newIdempotencyKey: createIdempotencyKey,
  }
}
