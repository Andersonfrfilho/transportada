/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createImportPollingState,
  createNfeWorkspaceClient,
  type ImportPollingState,
  type NfeWorkspaceClient as WorkspaceClient,
  type RequestUploadInput,
} from '../shared/nfeWorkspaceClient.service'

const IMPORT_PERMISSION = 'invoices.import'
const READ_PERMISSION = 'invoices.read'
const DOCUMENTS_QUERY_KEY = 'nfe-documents'
const IMPORTS_QUERY_KEY = 'nfe-imports'

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
  input: Readonly<{ companyId?: string; permissions: readonly string[] }>,
) {
  const client = getWorkspaceClient()
  const controller = createNfeWorkspaceController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const queryClient = useQueryClient()
  const importsQueryKey = [IMPORTS_QUERY_KEY, input.companyId] as const
  const documentsQueryKey = [DOCUMENTS_QUERY_KEY, input.companyId] as const
  const importsQuery = useQuery({
    enabled: controller.canRead,
    queryFn: () => client.listImports({ cursor: null, limit: 20 }),
    queryKey: importsQueryKey,
    refetchInterval: (query) => {
      const data = query.state.data
      const activeImport = data?.items[0] ?? null
      const pollingState: ImportPollingState = createImportPollingState({ activeImport })
      return pollingState.enabled ? (pollingState.intervalMs ?? false) : false
    },
  })
  const documentsQuery = useQuery({
    enabled: controller.canRead,
    queryFn: () => client.listDocuments({ cursor: null, limit: 20 }),
    queryKey: documentsQueryKey,
  })
  const uploadMutation = useMutation({
    mutationFn: client.requestUpload,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: importsQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })
  const distributionMutation = useMutation({
    mutationFn: client.requestDistribution,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsQueryKey }),
  })
  const reprocessMutation = useMutation({
    mutationFn: client.reprocessImport,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: importsQueryKey }),
        queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
      ])
    },
  })

  return {
    canImport: controller.canImport,
    canRead: controller.canRead,
    controller,
    documentsQuery,
    downloadDocumentXml: client.downloadDocumentXml,
    distributionMutation,
    importsQuery,
    reprocessMutation,
    uploadMutation,
    newIdempotencyKey: createIdempotencyKey,
  }
}
