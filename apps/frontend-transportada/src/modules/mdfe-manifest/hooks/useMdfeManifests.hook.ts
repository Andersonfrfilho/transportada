/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  MDFE_CANCEL_PERMISSION,
  MDFE_CLOSE_PERMISSION,
  MDFE_ISSUE_PERMISSION,
  MDFE_MANAGE_PERMISSION,
  MDFE_MANIFEST_ERROR,
  MDFE_MANIFEST_PAGE_SIZE,
  MDFE_READ_PERMISSION,
} from '../shared/mdfeManifest.constant'
import type {
  MdfeActionInput,
  MdfeCancelInput,
  MdfeCloseInput,
  MdfeIssuanceSummary,
  MdfeManifestCreateBody,
  MdfeManifestDetail,
  MdfeManifestFilters,
  MdfeManifestListInput,
  MdfeManifestPage,
  MdfeManifestPreview,
} from '../shared/mdfeManifest.types'
import {
  createMdfeManifestClient,
  type MdfeManifestClient,
} from '../shared/mdfeManifestClient.service'

const MDFE_MANIFESTS_QUERY_KEY = 'mdfe-manifests'

export type MdfeManifestController = Readonly<{
  canCancelManifests: boolean
  canCloseManifests: boolean
  canIssueManifests: boolean
  canManageManifests: boolean
  canReadManifests: boolean
  cancelManifest: (input: MdfeCancelInput) => Promise<MdfeIssuanceSummary>
  closeManifest: (input: MdfeCloseInput) => Promise<MdfeIssuanceSummary>
  createManifest: (input: MdfeManifestCreateBody) => Promise<MdfeManifestDetail>
  getManifest: (input: Readonly<{ manifestId: string }>) => Promise<MdfeManifestDetail>
  issueManifest: (input: MdfeActionInput) => Promise<MdfeIssuanceSummary>
  listManifests: (input: MdfeManifestListInput) => Promise<MdfeManifestPage>
  previewManifest: (
    input: Readonly<{ documentIds: readonly string[] }>,
  ) => Promise<MdfeManifestPreview>
}>

type ControllerInput = Readonly<{
  client: MdfeManifestClient
  permissions: readonly string[]
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error(MDFE_MANIFEST_ERROR.FORBIDDEN))
}

export function createMdfeManifestController(input: ControllerInput): MdfeManifestController {
  const canReadManifests = input.permissions.includes(MDFE_READ_PERMISSION)
  const canManageManifests = input.permissions.includes(MDFE_MANAGE_PERMISSION)
  const canIssueManifests = input.permissions.includes(MDFE_ISSUE_PERMISSION)
  const canCloseManifests = input.permissions.includes(MDFE_CLOSE_PERMISSION)
  const canCancelManifests = input.permissions.includes(MDFE_CANCEL_PERMISSION)

  return {
    canCancelManifests,
    canCloseManifests,
    canIssueManifests,
    canManageManifests,
    canReadManifests,
    cancelManifest: (body) =>
      canCancelManifests ? input.client.cancelManifest(body) : forbidden(),
    closeManifest: (body) => (canCloseManifests ? input.client.closeManifest(body) : forbidden()),
    createManifest: (body) =>
      canManageManifests ? input.client.createManifest(body) : forbidden(),
    getManifest: (query) => (canReadManifests ? input.client.getManifest(query) : forbidden()),
    issueManifest: (body) => (canIssueManifests ? input.client.issueManifest(body) : forbidden()),
    listManifests: (query) => (canReadManifests ? input.client.listManifests(query) : forbidden()),
    previewManifest: (body) =>
      canManageManifests ? input.client.previewManifest(body) : forbidden(),
  }
}

function getMdfeManifestClient(): MdfeManifestClient {
  return createMdfeManifestClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

type ManifestsQueryKey = readonly [string, string | undefined, string]

function useMdfeManifestMutations(
  input: Readonly<{ controller: MdfeManifestController; manifestsKey: ManifestsQueryKey }>,
) {
  const queryClient = useQueryClient()
  const invalidateManifests = () => queryClient.invalidateQueries({ queryKey: input.manifestsKey })

  return {
    cancelManifestMutation: useMutation({
      mutationFn: input.controller.cancelManifest,
      onSuccess: invalidateManifests,
    }),
    closeManifestMutation: useMutation({
      mutationFn: input.controller.closeManifest,
      onSuccess: invalidateManifests,
    }),
    createManifestMutation: useMutation({
      mutationFn: input.controller.createManifest,
      onSuccess: invalidateManifests,
    }),
    issueManifestMutation: useMutation({
      mutationFn: input.controller.issueManifest,
      onSuccess: invalidateManifests,
    }),
    previewManifestMutation: useMutation({ mutationFn: input.controller.previewManifest }),
  }
}

function resolveQueryStatus(
  input: Readonly<{ isError: boolean; isPending: boolean }>,
): 'error' | 'loading' | 'success' {
  if (input.isError) return 'error'
  if (input.isPending) return 'loading'
  return 'success'
}

export type MdfeManifestsState = ReturnType<typeof useMdfeManifestMutations> &
  Readonly<{
    controller: MdfeManifestController
    manifests: readonly MdfeManifestDetail[] | MdfeManifestPage['items']
    nextCursor: null | string
    status: 'error' | 'loading' | 'success'
  }>

export function useMdfeManifests(
  input: Readonly<{
    companyId?: string
    filters?: MdfeManifestFilters
    permissions: readonly string[]
  }>,
): MdfeManifestsState {
  const filters = input.filters ?? {}
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createMdfeManifestController({ client: getMdfeManifestClient(), permissions })
  const manifestsKey = [MDFE_MANIFESTS_QUERY_KEY, input.companyId, JSON.stringify(filters)] as const
  const manifestsQuery = useQuery({
    enabled: controller.canReadManifests,
    queryFn: () =>
      controller.listManifests({ cursor: null, filters, limit: MDFE_MANIFEST_PAGE_SIZE }),
    queryKey: manifestsKey,
  })
  const mutations = useMdfeManifestMutations({ controller, manifestsKey })

  return {
    ...mutations,
    controller,
    manifests: manifestsQuery.data?.items ?? [],
    nextCursor: manifestsQuery.data?.nextCursor ?? null,
    status: resolveQueryStatus({
      isError: manifestsQuery.isError,
      isPending: manifestsQuery.isPending,
    }),
  }
}
