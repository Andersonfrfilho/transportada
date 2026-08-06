/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import {
  splitPersonName,
  toCompanyUserView,
  type CompanyUserView,
} from '../domain/company-user.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { IdentityProfileGatewayPort } from './identity-profile.port.js'

type UpdateCompanyUserProfileDependencies = {
  readonly identityGateway: IdentityProfileGatewayPort
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'findByUserId' | 'findIdentitySubject' | 'updateProfile'
  >
}

export type UpdateCompanyUserProfileInput = {
  readonly channel?: ContactChannel
  readonly contact?: string
  readonly context: { readonly companyId: string }
  readonly email?: string
  readonly name?: string
  readonly userId: string
  readonly username?: string
}

export type UpdateCompanyUserProfileUseCase = {
  execute(input: UpdateCompanyUserProfileInput): Promise<CompanyUserView>
}

/**
 * Grava no banco antes de empurrar para o Keycloak. Sem transação distribuída, é essa ordem que
 * deixa a falha no meio do caminho segura: o painel mostra um login que ainda não autentica, em vez
 * de um login que autentica e ninguém vê. Repetir o mesmo PATCH converge.
 *
 * A colisão de `username` sai do índice único do banco, que é atingido antes do provedor.
 */
export function createUpdateCompanyUserProfileUseCase({
  identityGateway,
  repository,
}: UpdateCompanyUserProfileDependencies): UpdateCompanyUserProfileUseCase {
  return {
    async execute({ channel, contact, context, email, name, userId, username }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      await repository.updateProfile({
        userId,
        ...(contact === undefined ? {} : { contactAddress: contact }),
        ...(channel === undefined ? {} : { contactChannel: channel }),
        ...(name === undefined ? {} : { name }),
        ...(username === undefined ? {} : { username }),
      })

      const subject = await resolveIdentitySubject({ repository, userId })
      await identityGateway.updateUser({
        user: {
          ...(email === undefined ? {} : { email, emailVerified: false }),
          ...(name === undefined ? {} : toIdentityName(name)),
          ...(username === undefined ? {} : { username }),
        },
        userId: subject,
      })

      return toCompanyUserView({
        ...existing,
        contactAddress: contact ?? existing.contactAddress,
        contactChannel: channel ?? existing.contactChannel,
        name: name ?? existing.name,
        username: username ?? existing.username,
      })
    },
  }
}

/** Nome que encurtou não pode deixar o sobrenome antigo para trás no provedor. */
function toIdentityName(name: string): { readonly firstName: string; readonly lastName: string } {
  const { firstName, lastName } = splitPersonName(name)
  return { firstName, lastName: lastName ?? '' }
}
