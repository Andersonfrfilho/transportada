/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  CTE_PROFILES_ERROR,
  PROFILE_PAGE_SIZE,
  SETTINGS_MANAGE_PERMISSION,
} from '../shared/cteProfiles.constant'
import type {
  CteProfileBody,
  CteProfileDetail,
  CteProfileFilters,
  CteProfileVersionInput,
} from '../shared/cteProfiles.types'
import {
  createCteProfilesClient,
  type CteProfilesClient as Client,
} from '../shared/cteProfilesClient.service'
import { createCteProfilesViewModel } from '../shared/cteProfilesViewModel.service'

const CTE_PROFILES_QUERY_KEY = 'cte-emission-profiles'

export type CteProfilesClient = Client

export type CteProfilesController = Readonly<{
  activateProfile: (input: CteProfileVersionInput) => Promise<CteProfileDetail>
  canManageProfiles: boolean
  createProfile: (input: CteProfileBody) => Promise<CteProfileDetail>
  deactivateProfile: (input: CteProfileVersionInput) => Promise<CteProfileDetail>
  updateProfile: (input: CteProfileBody & CteProfileVersionInput) => Promise<CteProfileDetail>
}>

type ControllerInput = Readonly<{
  client: CteProfilesClient
  permissions: readonly string[]
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error(CTE_PROFILES_ERROR.FORBIDDEN))
}

export function createCteProfilesController(input: ControllerInput): CteProfilesController {
  const canManageProfiles = input.permissions.includes(SETTINGS_MANAGE_PERMISSION)

  return {
    activateProfile: (request) =>
      canManageProfiles ? input.client.activateProfile(request) : forbidden(),
    canManageProfiles,
    createProfile: (request) =>
      canManageProfiles ? input.client.createProfile(request) : forbidden(),
    deactivateProfile: (request) =>
      canManageProfiles ? input.client.deactivateProfile(request) : forbidden(),
    updateProfile: (request) =>
      canManageProfiles ? input.client.updateProfile(request) : forbidden(),
  }
}

function getCteProfilesClient(): CteProfilesClient {
  return createCteProfilesClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function useCteProfiles(
  input: Readonly<{
    companyId?: string
    filters?: CteProfileFilters
    permissions: readonly string[]
  }>,
) {
  const client = getCteProfilesClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createCteProfilesController({ client, permissions })
  const queryClient = useQueryClient()
  const profilesQueryKey = [CTE_PROFILES_QUERY_KEY, input.companyId, input.filters] as const

  const profilesQuery = useQuery({
    enabled: controller.canManageProfiles,
    queryFn: () =>
      client.listProfiles({
        cursor: null,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
        limit: PROFILE_PAGE_SIZE,
      }),
    queryKey: profilesQueryKey,
  })

  function invalidateProfiles(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: profilesQueryKey })
  }

  const createProfileMutation = useMutation({
    mutationFn: controller.createProfile,
    onSuccess: invalidateProfiles,
  })
  const updateProfileMutation = useMutation({
    mutationFn: controller.updateProfile,
    onSuccess: invalidateProfiles,
  })
  const activateProfileMutation = useMutation({
    mutationFn: controller.activateProfile,
    onSuccess: invalidateProfiles,
  })
  const deactivateProfileMutation = useMutation({
    mutationFn: controller.deactivateProfile,
    onSuccess: invalidateProfiles,
  })

  const viewModel = createCteProfilesViewModel({
    permissions,
    ...(profilesQuery.data === undefined ? {} : { profiles: profilesQuery.data }),
    status: profilesQuery.isError ? 'error' : profilesQuery.isLoading ? 'loading' : 'success',
  })

  return {
    activateProfileMutation,
    controller,
    createProfileMutation,
    deactivateProfileMutation,
    profilesQuery,
    updateProfileMutation,
    viewModel,
  }
}
