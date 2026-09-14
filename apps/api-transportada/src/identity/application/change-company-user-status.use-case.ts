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
  /** Estrutural, para `identity` não depender de `whatsapp-commands`. */
  readonly whatsappPhones: {
    unbindWithAudit(input: {
      readonly audit: {
        readonly actorUserId: string
        readonly companyId: string
        readonly correlationId: string
      }
      readonly userId: string
    }): Promise<boolean>
  }
}

export type ChangeCompanyUserStatusInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
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
 *
 * Spec 144 T005b M3: pela mesma razão o número do WhatsApp cai **primeiro**, com trilha. O vínculo
 * mora noutro repositório e o provedor não entra em transação; desvincular antes faz a falha de
 * qualquer passo seguinte deixar o usuário ativo e sem número — nunca suspenso com número calado.
 */
export function createChangeCompanyUserStatusUseCase({
  identityGateway,
  repository,
  whatsappPhones,
}: ChangeCompanyUserStatusDependencies): ChangeCompanyUserStatusUseCase {
  return {
    async execute({ context, correlationId, status, userId }) {
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
      const isLeavingLastCompany = shouldDisableIdentity({
        activeMembershipCompanyIds,
        leavingCompanyId: context.companyId,
      })
      if (isLeavingLastCompany) {
        /** Spec 144: o número verificado é credencial; sem empresa ativa nenhuma, ele cai junto. */
        await whatsappPhones.unbindWithAudit({
          audit: { actorUserId: context.userId, companyId: context.companyId, correlationId },
          userId,
        })
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
