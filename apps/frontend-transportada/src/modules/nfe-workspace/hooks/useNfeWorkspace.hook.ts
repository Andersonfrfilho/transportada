/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createDistributionPollingState,
  createImportPollingState,
  createNfeWorkspaceClient,
  type ImportPollingState,
  type NfeDocumentListPage,
  type NfeImportFilters,
  type NfeImportListPage,
  type NfeWorkspaceClient as WorkspaceClient,
  type RequestUploadInput,
} from '../shared/nfeWorkspaceClient.service'
import { NFE_DOCUMENTS_QUERY_KEY } from '../shared/nfeWorkspace.constant'

const IMPORT_PERMISSION = 'invoices.import'
const READ_PERMISSION = 'invoices.read'
const IMPORTS_QUERY_KEY = 'nfe-imports'
const DISTRIBUTION_STATUS_QUERY_KEY = 'nfe-distribution-status'
const MAX_UPLOAD_BATCH_BYTES = 768 * 1024
const PAGE_SIZE = 20
const DOCUMENTS_PAGE_SIZE = 100

export type NfeWorkspaceClient = WorkspaceClient

export type NfeWorkspaceController = Readonly<{
  canImport: boolean
  canRead: boolean
  reprocessImport: (input: Readonly<{ id: string; idempotencyKey: string }>) => Promise<void>
  requestDistribution: (input: Readonly<{ idempotencyKey: string }>) => Promise<void>
  requestUpload: (input: RequestUploadInput) => Promise<void>
}>

export type UploadDraftController = Readonly<{
  clear: () => void
  readonly selectedFiles: readonly File[]
  setFiles: (files: readonly File[]) => void
  submit: (
    input: Readonly<{ idempotencyKey: string }>,
  ) => Promise<Awaited<ReturnType<NfeWorkspaceClient['requestUpload']>>>
}>

type ControllerInput = Readonly<{
  client: NfeWorkspaceClient
  permissions: readonly string[]
}>

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function forbidden(): Promise<never> {
  return Promise.reject(new Error('NFE_WORKSPACE_FORBIDDEN'))
}

export function createNfeWorkspaceController(input: ControllerInput): NfeWorkspaceController {
  const canImport = input.permissions.includes(IMPORT_PERMISSION)
  const canRead = input.permissions.includes(READ_PERMISSION)

  return {
    canImport,
    canRead,
    reprocessImport: (request) =>
      canImport ? input.client.reprocessImport(request).then(() => undefined) : forbidden(),
    requestDistribution: (request) =>
      canImport ? input.client.requestDistribution(request).then(() => undefined) : forbidden(),
    requestUpload: (request) =>
      canImport ? input.client.requestUpload(request).then(() => undefined) : forbidden(),
  }
}

export function createUploadDraftController(input: {
  readonly requestUpload: (
    input: RequestUploadInput,
  ) => Promise<Awaited<ReturnType<NfeWorkspaceClient['requestUpload']>>>
}): UploadDraftController {
  let selectedFiles: readonly File[] = []

  return {
    clear() {
      selectedFiles = []
    },
    get selectedFiles() {
      return selectedFiles
    },
    setFiles(files) {
      selectedFiles = [...files]
    },
    async submit(request) {
      try {
        return await input.requestUpload({
          files: selectedFiles,
          idempotencyKey: request.idempotencyKey,
        })
      } finally {
        selectedFiles = []
      }
    },
  }
}

function getWorkspaceClient(): NfeWorkspaceClient {
  return createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useNfeWorkspace(
  input: Readonly<{
    companyId?: string
    importFilters?: NfeImportFilters
    permissions: readonly string[]
  }>,
) {
  const client = getWorkspaceClient()
  const controller = createNfeWorkspaceController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const queryClient = useQueryClient()
  const [distributionTriggeredAt, setDistributionTriggeredAt] = useState<null | number>(null)
  const importsQueryKey = [IMPORTS_QUERY_KEY, input.companyId, input.importFilters] as const
  const documentsQueryKey = [NFE_DOCUMENTS_QUERY_KEY, input.companyId] as const
  const distributionStatusQueryKey = [DISTRIBUTION_STATUS_QUERY_KEY, input.companyId] as const
  const importsQuery = useInfiniteQuery({
    enabled: controller.canRead,
    getNextPageParam: (lastPage: NfeImportListPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      client.listImports({
        cursor: pageParam,
        ...(input.importFilters === undefined ? {} : { filters: input.importFilters }),
        limit: PAGE_SIZE,
      }),
    queryKey: importsQueryKey,
    refetchInterval: (query) => {
      const activeImport = query.state.data?.pages[0]?.items[0] ?? null
      const pollingState: ImportPollingState = createImportPollingState({ activeImport })
      return pollingState.enabled ? (pollingState.intervalMs ?? false) : false
    },
  })
  const documentsQuery = useInfiniteQuery({
    enabled: controller.canRead,
    getNextPageParam: (lastPage: NfeDocumentListPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      client.listDocuments({ cursor: pageParam, limit: DOCUMENTS_PAGE_SIZE }),
    queryKey: documentsQueryKey,
  })
  const distributionStatusQuery = useQuery({
    enabled: controller.canRead,
    queryFn: () => client.getDistributionStatus(),
    queryKey: distributionStatusQueryKey,
    refetchInterval: (query) => {
      const pollingState = createDistributionPollingState({
        now: Date.now(),
        status: query.state.data,
        triggeredAt: distributionTriggeredAt,
      })
      return pollingState.enabled ? (pollingState.intervalMs ?? false) : false
    },
  })
  const {
    fetchNextPage: fetchNextDocuments,
    hasNextPage: hasMoreDocumentPages,
    isFetchingNextPage: isFetchingDocumentPage,
  } = documentsQuery
  useEffect(() => {
    if (hasMoreDocumentPages && !isFetchingDocumentPage) {
      void fetchNextDocuments()
    }
  }, [fetchNextDocuments, hasMoreDocumentPages, isFetchingDocumentPage])
  const imports: NfeImportListPage | undefined =
    importsQuery.data === undefined
      ? undefined
      : {
          items: importsQuery.data.pages.flatMap((page) => page.items),
          nextCursor: importsQuery.data.pages.at(-1)?.nextCursor ?? null,
        }
  const documents: NfeDocumentListPage | undefined =
    documentsQuery.data === undefined
      ? undefined
      : {
          items: documentsQuery.data.pages.flatMap((page) => page.items),
          nextCursor: documentsQuery.data.pages.at(-1)?.nextCursor ?? null,
        }
  const uploadMutation = useMutation({
    mutationFn: async (request: RequestUploadInput) => {
      const batches: File[][] = []
      let currentBatch: File[] = []
      let currentBytes = 0

      for (const file of request.files) {
        if (currentBatch.length > 0 && currentBytes + file.size > MAX_UPLOAD_BATCH_BYTES) {
          batches.push(currentBatch)
          currentBatch = []
          currentBytes = 0
        }
        currentBatch.push(file)
        currentBytes += file.size
      }
      if (currentBatch.length > 0) batches.push(currentBatch)

      const failures: Error[] = []
      for (const [index, files] of batches.entries()) {
        try {
          request.onBatchStarted?.(files)
          await client.requestUpload({
            files,
            idempotencyKey: index === 0 ? request.idempotencyKey : createIdempotencyKey(),
          })
          request.onBatchUploaded?.(files)
        } catch (error) {
          request.onBatchFailed?.(files)
          failures.push(error instanceof Error ? error : new Error('NFE_UPLOAD_BATCH_FAILED'))
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'NFE_UPLOAD_PARTIALLY_FAILED')
      }
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: importsQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })
  const distributionMutation = useMutation({
    mutationFn: client.requestDistribution,
    onSuccess: () => {
      setDistributionTriggeredAt(Date.now())
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: importsQueryKey }),
        queryClient.invalidateQueries({ queryKey: distributionStatusQueryKey }),
      ])
    },
  })
  const reprocessMutation = useMutation({
    mutationFn: client.reprocessImport,
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: importsQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })

  return {
    canImport: controller.canImport,
    canRead: controller.canRead,
    controller,
    documents,
    documentsQuery,
    downloadDocumentXml: client.downloadDocumentXml,
    distributionMutation,
    distributionStatus: distributionStatusQuery.data,
    distributionStatusQuery,
    fetchMoreDocuments: () => {
      void documentsQuery.fetchNextPage()
    },
    fetchMoreImports: () => {
      void importsQuery.fetchNextPage()
    },
    hasMoreDocuments: documentsQuery.hasNextPage,
    hasMoreImports: importsQuery.hasNextPage,
    imports,
    importsQuery,
    isLoadingAllDocuments:
      documentsQuery.isLoading || documentsQuery.hasNextPage || documentsQuery.isFetchingNextPage,
    isFetchingMoreDocuments: documentsQuery.isFetchingNextPage,
    isFetchingMoreImports: importsQuery.isFetchingNextPage,
    reprocessMutation,
    uploadMutation,
    newIdempotencyKey: createIdempotencyKey,
  }
}
