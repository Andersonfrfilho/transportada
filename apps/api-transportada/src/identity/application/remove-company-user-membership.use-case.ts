/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CompanyUserNotFoundError,
  SelfMembershipRemovalError,
} from '../domain/company-user.error.js'
import { shouldDisableIdentity } from '../domain/company-user.policy.js'
import { assertCompanyKeepsAdministrator } from '../domain/invitation.policy.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { IdentityEnablementGatewayPort } from './identity-enablement.port.js'

type RemoveCompanyUserMembershipDependencies = {
  readonly identityGateway: IdentityEnablementGatewayPort
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    | 'findByUserId'
    | 'findIdentitySubject'
    | 'listActiveMembershipCompanyIds'
    | 'listAdministratorUserIds'
    | 'removeMembership'
  >
  /** Estrutural, para `identity` não depender de `whatsapp-commands` (mesmo desenho da suspensão). */
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

export type RemoveCompanyUserMembershipInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
  readonly userId: string
}

export type RemoveCompanyUserMembershipUseCase = {
  execute(input: RemoveCompanyUserMembershipInput): Promise<void>
}

/**
 * Desabilita no provedor antes de remover o vínculo: falha no meio deixa sem acesso, não com.
 *
 * Spec 144 T018: remover a última membership ativa também desfaz o vínculo de WhatsApp, com trilha
 * — o mesmo remédio que a T005b (M3) já aplicou à suspensão. Antes desta task, suspender desfazia o
 * vínculo e **remover não**, o que deixava um número verificado apontando para uma conta sem vínculo
 * nenhum na instalação. O vínculo cai **antes** de desabilitar no provedor, pela mesma razão de
 * `change-company-user-status.use-case.ts`: falha em qualquer passo seguinte deixa o usuário sem
 * número, nunca removido com o número ainda calado.
 */
export function createRemoveCompanyUserMembershipUseCase({
  identityGateway,
  repository,
  whatsappPhones,
}: RemoveCompanyUserMembershipDependencies): RemoveCompanyUserMembershipUseCase {
  return {
    async execute({ context, correlationId, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      if (userId === context.userId) throw new SelfMembershipRemovalError()

      const administratorUserIds = await repository.listAdministratorUserIds({
        companyId: context.companyId,
      })
      assertCompanyKeepsAdministrator({ administratorUserIds, nextRoles: [], targetUserId: userId })

      const activeMembershipCompanyIds = await repository.listActiveMembershipCompanyIds({ userId })
      if (
        shouldDisableIdentity({ activeMembershipCompanyIds, leavingCompanyId: context.companyId })
      ) {
        await whatsappPhones.unbindWithAudit({
          audit: { actorUserId: context.userId, companyId: context.companyId, correlationId },
          userId,
        })
        const subject = await resolveIdentitySubject({ repository, userId })
        await identityGateway.setEnabled({ enabled: false, userId: subject })
      }

      await repository.removeMembership({ companyId: context.companyId, userId })
    },
  }
}
