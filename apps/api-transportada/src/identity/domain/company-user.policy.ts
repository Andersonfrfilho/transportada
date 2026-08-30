/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole, MembershipStatus } from '../../database/identity.schema.js'
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'

export const COMPANY_USER_STATUSES = ['invited', 'active', 'suspended'] as const
export type CompanyUserStatus = (typeof COMPANY_USER_STATUSES)[number]

/**
 * O que a pessoa é fora da tela de usuários: a ficha de motorista que o vínculo dela referencia e
 * os veículos atribuídos a essa ficha. Ausente quando não há ficha — vínculo que não existe não
 * vira link para lugar nenhum.
 */
export type CompanyUserFleetLink = {
  readonly driverId: string
  readonly vehicles: readonly { readonly id: string; readonly plate: string }[]
}

export type CompanyUserView = {
  readonly contact: { readonly channel: ContactChannel; readonly masked: string }
  /**
   * Mascarados como o contato, e pelo mesmo motivo: a listagem de administração serve para
   * reconhecer a pessoa, não para exportar a ficha dela. Campo vazio continua vazio — mascarar o
   * que não existe inventaria um dado que ninguém cadastrou.
   */
  readonly email: string
  readonly fleet?: CompanyUserFleetLink
  readonly id: string
  readonly invitation?: { readonly expiresAt: string; readonly status: 'pending' }
  /**
   * O `id` acima é a pessoa; este é o vínculo dela com a empresa, e são chaves diferentes. Quem
   * referencia vínculo — o motorista da frota — precisa deste, e sem publicá-lo o operador só
   * tinha o caminho de digitar o UUID à mão.
   */
  readonly membershipId: string
  readonly name: string
  readonly phone: string
  readonly roles: readonly CompanyRole[]
  readonly status: CompanyUserStatus
  readonly taxId: string
  readonly username: string
}

type CompanyUserViewSource = {
  readonly contactAddress: string
  readonly fleet?: CompanyUserFleetLink
  readonly contactChannel: ContactChannel
  readonly email: string
  readonly membershipId: string
  readonly membershipStatus: MembershipStatus
  readonly name: string
  readonly pendingInvitation: { readonly expiresAt: Date } | undefined
  readonly phone: string
  readonly roles: readonly CompanyRole[]
  readonly taxId: string
  readonly userId: string
  readonly username: string
}

type DeriveCompanyUserStatusParams = {
  readonly hasPendingInvitation: boolean
  readonly membershipStatus: MembershipStatus
}

type MaskContactAddressParams = {
  readonly channel: ContactChannel
  readonly value: string
}

/**
 * `invited` é derivado, não persistido: existe convite pendente ou não existe — o vínculo em si
 * já nasce `active` (§ user-invitation.schema.ts) mesmo antes da pessoa trocar o código por senha.
 */
export function deriveCompanyUserStatus({
  hasPendingInvitation,
  membershipStatus,
}: DeriveCompanyUserStatusParams): CompanyUserStatus {
  if (hasPendingInvitation) return 'invited'
  return membershipStatus === 'active' ? 'active' : 'suspended'
}

/**
 * O Keycloak separa nome e sobrenome; a aplicação guarda um campo só. O primeiro termo vira
 * `firstName` e o resto `lastName`, que fica ausente quando a pessoa informou um nome só.
 */
export function splitPersonName(name: string): {
  readonly firstName: string
  readonly lastName?: string
} {
  const terms = name.trim().split(/\s+/u)
  const [firstName, ...remaining] = terms
  if (firstName === undefined) return { firstName: name }

  return remaining.length === 0 ? { firstName } : { firstName, lastName: remaining.join(' ') }
}

/**
 * `enabled` é global no realm e o vínculo é por empresa: só desabilita quem não sobra ativo em
 * nenhuma outra. Uma transportadora com mais de um CNPJ compartilha as mesmas pessoas.
 */
export function shouldDisableIdentity({
  activeMembershipCompanyIds,
  leavingCompanyId,
}: {
  readonly activeMembershipCompanyIds: readonly string[]
  readonly leavingCompanyId: string
}): boolean {
  return activeMembershipCompanyIds.every((companyId) => companyId === leavingCompanyId)
}

/** O endereço em claro nunca sai da API — só a versão mascarada chega à listagem. */
export function maskContactAddress({ channel, value }: MaskContactAddressParams): string {
  if (channel === 'email') return maskEmailAddress(value)

  const visibleSuffixLength = 2
  return `${value.slice(0, 1)}***${value.slice(-visibleSuffixLength)}`
}

/** Ponto único de conversão do registro cru do repositório para o corpo que a API devolve. */
export function toCompanyUserView(source: CompanyUserViewSource): CompanyUserView {
  const status = deriveCompanyUserStatus({
    hasPendingInvitation: source.pendingInvitation !== undefined,
    membershipStatus: source.membershipStatus,
  })

  return {
    contact: {
      channel: source.contactChannel,
      masked: maskContactAddress({ channel: source.contactChannel, value: source.contactAddress }),
    },
    email: maskEmailOrEmpty(source.email),
    ...(source.fleet === undefined ? {} : { fleet: source.fleet }),
    id: source.userId,
    membershipId: source.membershipId,
    name: source.name,
    phone: maskTrailingDigits(source.phone),
    roles: source.roles,
    status,
    taxId: maskTrailingDigits(source.taxId),
    username: source.username,
    ...(source.pendingInvitation === undefined
      ? {}
      : {
          invitation: {
            expiresAt: source.pendingInvitation.expiresAt.toISOString(),
            status: 'pending' as const,
          },
        }),
  }
}

export function maskIdentityEmail(value: string): string {
  return maskEmailOrEmpty(value)
}

export function maskIdentityTaxId(value: string): string {
  return maskTrailingDigits(value)
}

function maskEmailAddress(email: string): string {
  const [local, domain] = email.split('@')
  if (local === undefined || domain === undefined) return email

  const separatorIndex = domain.indexOf('.')
  const domainSuffix = separatorIndex === -1 ? '' : domain.slice(separatorIndex)
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${domainSuffix}`
}

/** Mascarar campo vazio produziria `***` para quem nunca cadastrou nada — o vazio é a resposta. */
function maskEmailOrEmpty(value: string): string {
  return value === '' ? '' : maskEmailAddress(value)
}

function maskTrailingDigits(value: string): string {
  const visibleSuffixLength = 2
  if (value.length <= visibleSuffixLength) return value === '' ? '' : '***'
  return `***${value.slice(-visibleSuffixLength)}`
}
