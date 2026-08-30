/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GroupAuditPort } from './company-group.audit.port.js'
import type { CompanyGroupRepositoryPort } from './company-group.port.js'

type Actor = { readonly companyId: string; readonly userId: string }

type ManageDirectPermissionsDependencies = {
  readonly audit: GroupAuditPort
  readonly repository: Pick<
    CompanyGroupRepositoryPort,
    'grantDirectPermissions' | 'listDirectPermissions' | 'revokeDirectPermissions'
  >
}

export type ManageDirectPermissionsUseCase = {
  grant(input: {
    readonly context: Actor
    readonly correlationId: string
    readonly permissions: readonly string[]
    readonly userId: string
  }): Promise<void>
  list(input: { readonly context: Actor; readonly userId: string }): Promise<readonly string[]>
  revoke(input: {
    readonly context: Actor
    readonly correlationId: string
    readonly permissions: readonly string[]
    readonly userId: string
  }): Promise<void>
}

/**
 * A permissão concedida direto à pessoa é **exceção**, e o grupo é a regra: o que se espera é que
 * quase ninguém tenha uma. Ela existe para o caso que não vale um grupo — e é por ser exceção que
 * carrega autor no banco e linha de auditoria em cada concessão.
 */
export function createManageDirectPermissionsUseCase({
  audit,
  repository,
}: ManageDirectPermissionsDependencies): ManageDirectPermissionsUseCase {
  return {
    async grant({ context, correlationId, permissions, userId }) {
      await repository.grantDirectPermissions({
        companyId: context.companyId,
        grantedByUserId: context.userId,
        permissions,
        userId,
      })

      await audit.record({
        action: 'company-user.permission.granted',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        metadata: { permissions: [...permissions] },
        targetIds: [userId],
      })
    },

    list: ({ context, userId }) =>
      repository.listDirectPermissions({ companyId: context.companyId, userId }),

    async revoke({ context, correlationId, permissions, userId }) {
      await repository.revokeDirectPermissions({
        companyId: context.companyId,
        permissions,
        userId,
      })

      await audit.record({
        action: 'company-user.permission.revoked',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        metadata: { permissions: [...permissions] },
        targetIds: [userId],
      })
    },
  }
}
