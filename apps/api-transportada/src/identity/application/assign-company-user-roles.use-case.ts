/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type AssignCompanyUserRolesDependencies = {
  readonly repository: Pick<CompanyUserRepositoryPort, 'addRoles'>
}

export type AssignCompanyUserRolesInput = {
  readonly context: { readonly companyId: string }
  readonly roles: readonly CompanyRole[]
  readonly userIds: readonly string[]
}

export type AssignCompanyUserRolesResult = {
  /** Quem o lote alcançou. Id fora da empresa não entra, e não vira erro. */
  readonly affectedUserIds: readonly string[]
}

export type AssignCompanyUserRolesUseCase = {
  execute(input: AssignCompanyUserRolesInput): Promise<AssignCompanyUserRolesResult>
}

/**
 * Aplicar papéis a vários de uma vez **acrescenta**, nunca troca: o operador escolheu somar
 * "Fiscal" a doze pessoas, não apagar o que cada uma já tinha. A diferença é invisível na tela e
 * catastrófica no banco — trocar tiraria o papel de administrador de quem o tinha, em silêncio.
 */
export function createAssignCompanyUserRolesUseCase({
  repository,
}: AssignCompanyUserRolesDependencies): AssignCompanyUserRolesUseCase {
  return {
    async execute({ context, roles, userIds }) {
      const { affectedUserIds } = await repository.addRoles({
        companyId: context.companyId,
        roles,
        userIds,
      })

      /** Nenhum id do lote pertence à empresa: é ausência, e o chamador precisa saber que errou. */
      if (affectedUserIds.length === 0) throw new CompanyUserNotFoundError()

      return { affectedUserIds }
    },
  }
}
