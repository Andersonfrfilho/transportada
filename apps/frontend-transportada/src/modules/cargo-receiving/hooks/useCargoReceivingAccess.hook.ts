/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { isWorkspaceForbidden } from '@/modules/shared/workspaceWall.service'

import {
  CARGO_RECEIVING_WORKSPACE,
  CARGO_RECEIVING_WRITE_PERMISSION,
} from '../shared/cargoReceiving.constant'

export type CargoReceivingAccess = Readonly<{
  /** Escrever é `trip.manage`: quem só lê vê tudo e não age. */
  canManage: boolean
  hasFailed: boolean
  isForbidden: boolean
  isLoading: boolean
}>

/** A parede decide pelo mesmo mapa do menu (spec 221): leitura é `fleet.read`, como na API. */
export function useCargoReceivingAccess(): CargoReceivingAccess {
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id

  return {
    canManage: permissions.includes(CARGO_RECEIVING_WRITE_PERMISSION),
    hasFailed: authQuery.isError,
    isForbidden: isWorkspaceForbidden({
      companyId,
      permissions,
      workspace: CARGO_RECEIVING_WORKSPACE,
    }),
    isLoading: authQuery.isLoading,
  }
}
