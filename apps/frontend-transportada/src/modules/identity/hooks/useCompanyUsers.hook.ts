/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  canGoToPreviousCursorPage,
  FIRST_CURSOR_PAGE,
  nextCursorPage,
  previousCursorPage,
  type CursorPageState,
} from '@/modules/shared/cursorPagination.service'

import {
  COMPANY_USER_ERROR,
  COMPANY_USERS_PAGE_SIZE,
  USERS_MANAGE_PERMISSION,
} from '../shared/companyUsers.constant'
import type {
  AssignCompanyUserRolesInput,
  AssignedCompanyUserRoles,
  ChangeCompanyUserStatusInput,
  CompanyUser,
  InvitedCompanyUser,
  InviteCompanyUserInput,
  ReplaceCompanyUserRolesInput,
  ResendInvitationResult,
  UpdateCompanyUserProfileInput,
} from '../shared/companyUsers.types'
import {
  createCompanyUsersClient,
  type CompanyUsersClient as Client,
} from '../shared/companyUsersClient.service'
import { createCompanyUsersViewModel } from '../shared/companyUsersViewModel.service'
import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'

const COMPANY_USERS_ADMINISTRATION_QUERY_KEY = 'company-users-administration'

export type CompanyUsersClient = Client

export type CompanyUsersController = Readonly<{
  assignRoles: (input: AssignCompanyUserRolesInput) => Promise<AssignedCompanyUserRoles>
  canManageUsers: boolean
  changeStatus: (input: ChangeCompanyUserStatusInput) => Promise<CompanyUser>
  inviteUser: (input: InviteCompanyUserInput) => Promise<InvitedCompanyUser>
  removeUser: (input: Readonly<{ userId: string }>) => Promise<void>
  replaceRoles: (input: ReplaceCompanyUserRolesInput) => Promise<CompanyUser>
  resendInvitation: (input: Readonly<{ userId: string }>) => Promise<ResendInvitationResult>
  updateProfile: (input: UpdateCompanyUserProfileInput) => Promise<CompanyUser>
}>

type ControllerInput = Readonly<{
  client: CompanyUsersClient
  permissions: readonly string[]
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error(COMPANY_USER_ERROR.FORBIDDEN))
}

/** A rota já recusa sem a permissão; barrar aqui evita o 403 que a tela não teria como explicar. */
export function createCompanyUsersController(input: ControllerInput): CompanyUsersController {
  const canManageUsers = input.permissions.includes(USERS_MANAGE_PERMISSION)

  return {
    canManageUsers,
    changeStatus: (request) => (canManageUsers ? input.client.changeStatus(request) : forbidden()),
    inviteUser: (request) => (canManageUsers ? input.client.inviteUser(request) : forbidden()),
    removeUser: (request) => (canManageUsers ? input.client.removeUser(request) : forbidden()),
    assignRoles: (request) => (canManageUsers ? input.client.assignRoles(request) : forbidden()),
    replaceRoles: (request) => (canManageUsers ? input.client.replaceRoles(request) : forbidden()),
    resendInvitation: (request) =>
      canManageUsers ? input.client.resendInvitation(request) : forbidden(),
    updateProfile: (request) =>
      canManageUsers ? input.client.updateProfile(request) : forbidden(),
  }
}

export function getCompanyUsersClient(): CompanyUsersClient {
  return createCompanyUsersClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function useCompanyUsers(
  input: Readonly<{
    permissions: readonly string[]
    client?: CompanyUsersClient
    companyId?: string
  }>,
) {
  const [page, setPage] = useState<CursorPageState>(FIRST_CURSOR_PAGE)
  const client = input.client ?? getCompanyUsersClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createCompanyUsersController({ client, permissions })
  const queryClient = useQueryClient()

  const usersQuery = useQuery({
    enabled: controller.canManageUsers,
    queryFn: () => client.listUsers({ cursor: page.cursor, limit: COMPANY_USERS_PAGE_SIZE }),
    queryKey: [COMPANY_USERS_ADMINISTRATION_QUERY_KEY, input.companyId, page.cursor],
  })

  /** A invalidação é por prefixo: convidar ou remover reescreve todas as páginas do cursor. */
  function invalidateUsers(): Promise<void> {
    return queryClient.invalidateQueries({
      queryKey: [COMPANY_USERS_ADMINISTRATION_QUERY_KEY],
    })
  }

  const inviteUserMutation = useMutation({
    mutationFn: controller.inviteUser,
    onSuccess: invalidateUsers,
  })
  const updateProfileMutation = useMutation({
    mutationFn: controller.updateProfile,
    onSuccess: invalidateUsers,
  })
  /** Acrescentar papéis a um lote é rota própria: `replaceRoles` **substitui**, e apagaria o resto. */
  const assignRolesMutation = useMutation({
    mutationFn: controller.assignRoles,
    onSuccess: invalidateUsers,
  })
  const replaceRolesMutation = useMutation({
    mutationFn: controller.replaceRoles,
    onSuccess: invalidateUsers,
  })
  const changeStatusMutation = useMutation({
    mutationFn: controller.changeStatus,
    onSuccess: invalidateUsers,
  })
  const removeUserMutation = useMutation({
    mutationFn: controller.removeUser,
    onSuccess: invalidateUsers,
  })
  const resendInvitationMutation = useMutation({ mutationFn: controller.resendInvitation })

  const viewModel = createCompanyUsersViewModel({
    ...(usersQuery.data === undefined ? {} : { page: usersQuery.data }),
    permissions,
    queryStatus: usersQuery.isError ? 'error' : usersQuery.isLoading ? 'loading' : 'success',
  })

  return {
    canGoToPreviousPage: canGoToPreviousCursorPage(page),
    changeStatusMutation,
    controller,
    goToFirstPage: () => setPage(FIRST_CURSOR_PAGE),
    goToNextPage: () => setPage((current) => nextCursorPage(current, viewModel.nextCursor)),
    goToPreviousPage: () => setPage((current) => previousCursorPage(current)),
    inviteUserMutation,
    removeUserMutation,
    assignRolesMutation,
    replaceRolesMutation,
    resendInvitationMutation,
    updateProfileMutation,
    usersQuery,
    viewModel,
  }
}
