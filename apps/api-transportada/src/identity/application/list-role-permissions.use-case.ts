/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { COMPANY_ROLES, type CompanyRole } from '../../database/identity.schema.js'
import {
  COMPANY_ROLE_PERMISSIONS,
  TRANSPORTADA_PERMISSIONS,
  type CompanyPermission,
} from '../domain/authorization.policy.js'

export type RolePermissionMatrix = {
  /** Toda permissão que a instalação conhece, para a tela mostrar também o que ninguém alcança. */
  readonly permissions: readonly string[]
  readonly roles: readonly { readonly permissions: readonly string[]; readonly role: CompanyRole }[]
}

export type ListRolePermissionsUseCase = {
  execute(): RolePermissionMatrix
}

/**
 * A matriz já existe em código e é invisível: ninguém consegue responder "o que este papel enxerga?"
 * sem abrir o repositório. Servi-la é o que permite a tela responder — e servir da constante, em vez
 * de copiá-la para o frontend, é o que impede as duas de divergirem na primeira permissão nova.
 *
 * `companies.manage` fica de fora: ela é reservada e sem consumidor (ADR-0021, instalação
 * dedicada), e listá-la prometeria um poder que nenhum papel desta instalação tem.
 */
export function createListRolePermissionsUseCase(): ListRolePermissionsUseCase {
  return {
    execute: () => ({
      permissions: TRANSPORTADA_PERMISSIONS.filter(
        (permission): permission is CompanyPermission => permission !== 'companies.manage',
      ),
      roles: COMPANY_ROLES.map((role) => ({
        permissions: [...(COMPANY_ROLE_PERMISSIONS[role] ?? [])],
        role,
      })),
    }),
  }
}
