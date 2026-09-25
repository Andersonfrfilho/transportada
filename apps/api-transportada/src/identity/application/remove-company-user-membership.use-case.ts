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
 * Remove o vínculo **antes** de tocar no provedor externo, ao contrário de
 * `change-company-user-status.use-case.ts` (spec 191 T2.2, medição do executor anterior): o
 * `DELETE` já vive numa transação atômica própria (`removeMembership`, que também apaga o
 * histórico de convite e de recuperação) — ou ela toda vale, ou nada dela vale. Desabilitar no
 * provedor e desvincular o WhatsApp **antes** dessa transação deixava, medido, a conta desabilitada
 * no Keycloak com o vínculo intacto no banco sempre que o `DELETE` batia no `23503` das FKs
 * `RESTRICT` de `user_invitations`/`password_reset_requests` — efeito externo aplicado, escrita
 * interna revertida, sem como desfazer o primeiro. Fazer o banco primeiro elimina esse meio-termo: o
 * efeito externo só é tentado depois que a remoção já é fato consumado, nunca antes.
 *
 * Spec 144 T018: remover a última membership ativa também desfaz o vínculo de WhatsApp, com trilha
 * — o mesmo remédio que a T005b (M3) já aplicou à suspensão. O `subject` do Keycloak é resolvido
 * antes do `DELETE` (leitura pura de `external_identities`, que a remoção da membership não afeta):
 * assim, uma identidade sem `external_identities` falha **antes** de mexer no banco, e não depois.
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
      const isLeavingLastCompany = shouldDisableIdentity({
        activeMembershipCompanyIds,
        leavingCompanyId: context.companyId,
      })
      const subject = isLeavingLastCompany
        ? await resolveIdentitySubject({ repository, userId })
        : undefined

      await repository.removeMembership({
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        userId,
      })

      if (subject !== undefined) {
        await whatsappPhones.unbindWithAudit({
          audit: { actorUserId: context.userId, companyId: context.companyId, correlationId },
          userId,
        })
        await identityGateway.setEnabled({ enabled: false, userId: subject })
      }
    },
  }
}
