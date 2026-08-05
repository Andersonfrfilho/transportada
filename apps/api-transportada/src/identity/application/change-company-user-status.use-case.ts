/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MembershipStatus } from '../../database/identity.schema.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import { toCompanyUserView, type CompanyUserView } from '../domain/company-user.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

export const COMPANY_USER_API_STATUSES = ['active', 'suspended'] as const
export type CompanyUserApiStatus = (typeof COMPANY_USER_API_STATUSES)[number]

const API_STATUS_TO_MEMBERSHIP_STATUS: Record<CompanyUserApiStatus, MembershipStatus> = {
  active: 'active',
  suspended: 'disabled',
}

type ChangeCompanyUserStatusDependencies = {
  readonly repository: Pick<CompanyUserRepositoryPort, 'findByUserId' | 'setMembershipStatus'>
}

export type ChangeCompanyUserStatusInput = {
  readonly context: { readonly companyId: string }
  readonly status: CompanyUserApiStatus
  readonly userId: string
}

export type ChangeCompanyUserStatusUseCase = {
  execute(input: ChangeCompanyUserStatusInput): Promise<CompanyUserView>
}

/** Sem guarda de último administrador aqui: suspender continua reversível, remover não. */
export function createChangeCompanyUserStatusUseCase({
  repository,
}: ChangeCompanyUserStatusDependencies): ChangeCompanyUserStatusUseCase {
  return {
    async execute({ context, status, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      const membershipStatus = API_STATUS_TO_MEMBERSHIP_STATUS[status]
      await repository.setMembershipStatus({
        companyId: context.companyId,
        status: membershipStatus,
        userId,
      })

      return toCompanyUserView({ ...existing, membershipStatus })
    },
  }
}
