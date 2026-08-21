/* Copyright (c) 2026 Ada Technology. MIT License. */
import { COMPANY_ROLES, USERS_MANAGE_PERMISSION } from './companyUsers.constant'
import type { CompanyUser, CompanyUserPage } from './companyUsers.types'

export type CompanyUsersViewStatus = 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'

export type CompanyUsersViewModel = Readonly<{
  canManageUsers: boolean
  nextCursor: null | string
  status: CompanyUsersViewStatus
  users: readonly CompanyUser[]
}>

type ViewModelInput = Readonly<{
  permissions: readonly string[]
  queryStatus: 'error' | 'loading' | 'success'
  page?: CompanyUserPage
}>

export function createCompanyUsersViewModel(input: ViewModelInput): CompanyUsersViewModel {
  const canManageUsers = input.permissions.includes(USERS_MANAGE_PERMISSION)
  const users = input.page?.users ?? []
  const nextCursor = input.page?.nextCursor ?? null

  return {
    canManageUsers,
    nextCursor,
    status: resolveStatus({ ...input, canManageUsers, hasUsers: users.length > 0 }),
    users,
  }
}

function resolveStatus(
  input: ViewModelInput & Readonly<{ canManageUsers: boolean; hasUsers: boolean }>,
): CompanyUsersViewStatus {
  if (!input.canManageUsers) return 'forbidden'
  if (input.queryStatus === 'loading') return 'loading'
  if (input.queryStatus === 'error') return 'error'
  return input.hasUsers ? 'ready' : 'empty'
}

/**
 * O catálogo do cliente pode estar atrás do da API: o papel já gravado entra na lista mesmo
 * desconhecido, senão editar os papéis de alguém apagaria em silêncio o que não está aqui.
 */
export function buildRoleChoices(currentRoles: readonly string[]): readonly string[] {
  const known: readonly string[] = COMPANY_ROLES
  return [...known, ...currentRoles.filter((role) => !known.includes(role))]
}
