/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { isWorkspaceForbidden } from '@/modules/shared/workspaceWall.service'

import {
  CARGO_RECEIVING_RESOLVE_PERMISSION,
  CARGO_RECEIVING_WORKSPACE,
  CARGO_RECEIVING_WRITE_PERMISSION,
} from '../shared/cargoReceiving.constant'

export type CargoReceivingAccess = Readonly<{
  /** Escrever é `trip.manage`: quem só lê vê tudo e não age. */
  canManage: boolean
  /** `occurrences.resolve`: só quem decide a tratativa desfaz a devolução ao contratante. */
  canResolve: boolean
  /** A empresa do contexto: a frota que o roteirizador oferece só é lida com ela. */
  companyId: string | undefined
  hasFailed: boolean
  isForbidden: boolean
  isLoading: boolean
  permissions: readonly string[]
}>

/** A parede decide pelo mesmo mapa do menu (spec 221): leitura é `fleet.read`, como na API. */
export function useCargoReceivingAccess(): CargoReceivingAccess {
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id

  return {
    canManage: permissions.includes(CARGO_RECEIVING_WRITE_PERMISSION),
    canResolve: permissions.includes(CARGO_RECEIVING_RESOLVE_PERMISSION),
    companyId,
    hasFailed: authQuery.isError,
    isForbidden: isWorkspaceForbidden({
      companyId,
      permissions,
      workspace: CARGO_RECEIVING_WORKSPACE,
    }),
    isLoading: authQuery.isLoading,
    permissions,
  }
}
