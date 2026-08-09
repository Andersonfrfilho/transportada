/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MembershipStatus } from '../../database/identity.schema.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import {
  shouldDisableIdentity,
  toCompanyUserView,
  type CompanyUserView,
} from '../domain/company-user.policy.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { IdentityEnablementGatewayPort } from './identity-enablement.port.js'

export const COMPANY_USER_API_STATUSES = ['active', 'suspended'] as const
export type CompanyUserApiStatus = (typeof COMPANY_USER_API_STATUSES)[number]

const API_STATUS_TO_MEMBERSHIP_STATUS: Record<CompanyUserApiStatus, MembershipStatus> = {
  active: 'active',
  suspended: 'disabled',
}

type ChangeCompanyUserStatusDependencies = {
  readonly identityGateway: IdentityEnablementGatewayPort
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    | 'findByUserId'
    | 'findIdentitySubject'
    | 'listActiveMembershipCompanyIds'
    | 'setMembershipStatus'
  >
}

export type ChangeCompanyUserStatusInput = {
  readonly context: { readonly companyId: string }
  readonly status: CompanyUserApiStatus
  readonly userId: string
}

export type ChangeCompanyUserStatusUseCase = {
  execute(input: ChangeCompanyUserStatusInput): Promise<CompanyUserView>
}

/**
 * Sem guarda de último administrador aqui: suspender continua reversível, remover não.
 *
 * A ordem das duas escritas é deliberada e não pode inverter: desabilitar chama o provedor antes
 * do banco, habilitar chama o banco antes do provedor. Sem transação distribuída, é assim que
 * qualquer falha no meio deixa o usuário sem acesso em vez de com acesso indevido.
 */
export function createChangeCompanyUserStatusUseCase({
  identityGateway,
  repository,
}: ChangeCompanyUserStatusDependencies): ChangeCompanyUserStatusUseCase {
  return {
    async execute({ context, status, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      const membershipStatus = API_STATUS_TO_MEMBERSHIP_STATUS[status]
      const subject = await resolveIdentitySubject({ repository, userId })

      if (membershipStatus === 'active') {
        await repository.setMembershipStatus({
          companyId: context.companyId,
          status: membershipStatus,
          userId,
        })
        await identityGateway.setEnabled({ enabled: true, userId: subject })
        return toCompanyUserView({ ...existing, membershipStatus })
      }

      const activeMembershipCompanyIds = await repository.listActiveMembershipCompanyIds({ userId })
      if (
        shouldDisableIdentity({ activeMembershipCompanyIds, leavingCompanyId: context.companyId })
      ) {
        await identityGateway.setEnabled({ enabled: false, userId: subject })
      }

      await repository.setMembershipStatus({
        companyId: context.companyId,
        status: membershipStatus,
        userId,
      })
      return toCompanyUserView({ ...existing, membershipStatus })
    },
  }
}
