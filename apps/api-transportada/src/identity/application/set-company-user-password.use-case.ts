/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import type { GroupAuditPort } from './company-group.audit.port.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'

type SetCompanyUserPasswordDependencies = {
  readonly audit: GroupAuditPort
  readonly gateway: Pick<IdentityAccessGatewayPort, 'setPassword'>
  readonly repository: Pick<CompanyUserRepositoryPort, 'findByUserId' | 'findIdentitySubject'>
}

export type SetCompanyUserPasswordInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
  readonly password: string
  readonly temporary: boolean
  readonly userId: string
}

export type SetCompanyUserPasswordUseCase = {
  execute(input: SetCompanyUserPasswordInput): Promise<void>
}

/**
 * A senha não passa pelo nosso banco em momento algum: ela vai do corpo da requisição para o
 * Keycloak, que é o depósito de senha desta instalação. Guardar hash aqui criaria um segundo lugar
 * onde a senha vive, e dois depósitos discordam no dia em que um deles falha no meio.
 *
 * O vínculo é conferido **antes** de tocar no provedor: sem isso, quem administra uma empresa
 * trocaria a senha de qualquer conta do realm digitando o id dela.
 *
 * A trilha guarda quem trocou a senha de quem, e nunca a senha (`security.md` §1 e §10).
 */
export function createSetCompanyUserPasswordUseCase({
  audit,
  gateway,
  repository,
}: SetCompanyUserPasswordDependencies): SetCompanyUserPasswordUseCase {
  return {
    async execute({ context, correlationId, password, temporary, userId }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      const subject = await resolveIdentitySubject({ repository, userId })
      await gateway.setPassword({ password, temporary, userId: subject })

      await audit.record({
        action: 'company-user.password.set',
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        targetIds: [userId],
      })
    },
  }
}
