/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'
import { IDENTITY_USER_ATTRIBUTE } from '../domain/identity-attribute.constant.js'
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import {
  splitPersonName,
  toCompanyUserView,
  type CompanyUserView,
} from '../domain/company-user.policy.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { UserPictureRepositoryPort } from './user-picture.port.js'
import { resolveIdentitySubject } from './company-user-identity.service.js'
import type { IdentityProfileGatewayPort } from './identity-profile.port.js'

type UpdateCompanyUserProfileDependencies = {
  readonly identityGateway: IdentityProfileGatewayPort
  /** A foto entra no conjunto de atributos; sem ela na mão, gravar o CPF a apagaria do provedor. */
  readonly pictures: Pick<UserPictureRepositoryPort, 'find'>
  /** O endereço desta instalação. Sem ele o atributo da foto não é escrito: URL inventada não abre. */
  readonly publicBaseUrl?: string
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
  readonly phone?: string
  readonly taxId?: string
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
  pictures,
  publicBaseUrl,
  repository,
}: UpdateCompanyUserProfileDependencies): UpdateCompanyUserProfileUseCase {
  return {
    async execute({ channel, contact, context, email, name, phone, taxId, userId, username }) {
      const existing = await repository.findByUserId({ companyId: context.companyId, userId })
      if (existing === undefined) throw new CompanyUserNotFoundError()

      await repository.updateProfile({
        userId,
        ...(contact === undefined ? {} : { contactAddress: contact }),
        ...(channel === undefined ? {} : { contactChannel: channel }),
        ...(email === undefined ? {} : { email }),
        ...(name === undefined ? {} : { name }),
        ...(phone === undefined ? {} : { phone }),
        ...(taxId === undefined ? {} : { taxId }),
        ...(username === undefined ? {} : { username }),
      })

      const subject = await resolveIdentitySubject({ repository, userId })
      try {
        await identityGateway.updateUser({
          user: {
            ...(email === undefined ? {} : { email, emailVerified: false }),
            ...(name === undefined ? {} : toIdentityName(name)),
            ...(username === undefined ? {} : { username }),
          },
          userId: subject,
        })
      } catch (error) {
        /**
         * Gravar antes é seguro enquanto repetir o PATCH converge. Para o login não converge: a
         * recusa mais comum é o realm com `editUsernameAllowed` desligado, que é decisão de
         * configuração — tentar de novo dá a mesma negativa para sempre, e o banco fica com um login
         * que o provedor não conhece. Quem tentar entrar com ele não entra, e a tela não avisa.
         *
         * Por isso o login volta ao que era antes de o erro subir. Os demais campos ficam gravados:
         * eles convergem na próxima tentativa, e desfazê-los perderia correção que já valia.
         */
        if (username !== undefined) {
          await repository.updateProfile({ userId, username: existing.username })
        }
        throw error
      }

      /**
       * O atributo vai numa chamada própria e depois do perfil. O Admin API **substitui o conjunto
       * inteiro**, e é por isso que este bloco monta a ficha completa em vez de só o que mudou:
       * mandar `company_id` + `tax_id` apagava a foto do provedor a cada edição de CPF — invisível
       * enquanto ninguém lia o atributo, destrutivo assim que a imagem passou a morar nele.
       *
       * A foto é lida daqui, que é onde ela mora; o provedor é espelho, não fonte.
       */
      const merged = {
        phone: phone ?? existing.phone,
        taxId: taxId ?? existing.taxId,
      }
      const picture = await pictures.find({ companyId: context.companyId, userId })

      await identityGateway.updateAttributes({
        attributes: {
          [IDENTITY_USER_ATTRIBUTE.COMPANY_ID]: context.companyId,
          ...(merged.taxId === '' ? {} : { [IDENTITY_USER_ATTRIBUTE.TAX_ID]: merged.taxId }),
          ...(merged.phone === '' ? {} : { [IDENTITY_USER_ATTRIBUTE.PHONE]: merged.phone }),
          ...(picture?.publicToken == null || publicBaseUrl === undefined
            ? {}
            : {
                [IDENTITY_USER_ATTRIBUTE.PICTURE]: `${publicBaseUrl}/public/company-users/${picture.publicToken}/picture`,
              }),
        },
        userId: subject,
      })

      return toCompanyUserView({
        ...existing,
        contactAddress: contact ?? existing.contactAddress,
        contactChannel: channel ?? existing.contactChannel,
        name: name ?? existing.name,
        phone: phone ?? existing.phone,
        taxId: taxId ?? existing.taxId,
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
