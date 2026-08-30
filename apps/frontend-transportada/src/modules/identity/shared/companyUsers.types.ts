/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  COMPANY_ROLES,
  COMPANY_USER_API_STATUSES,
  COMPANY_USER_STATUSES,
  CONTACT_CHANNELS,
} from './companyUsers.constant'

export type CompanyRole = (typeof COMPANY_ROLES)[number]
export type CompanyUserStatus = (typeof COMPANY_USER_STATUSES)[number]
export type CompanyUserApiStatus = (typeof COMPANY_USER_API_STATUSES)[number]
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

/**
 * Papel, estado e canal chegam como texto de propósito: catálogo do cliente atrás do da API
 * derrubaria a tela inteira por causa de um valor novo, e aqui o desconhecido só perde o rótulo.
 *
 * `id` é a pessoa e `membershipId` é o vínculo dela com a empresa — é o vínculo que o motorista da
 * frota referencia, e por isso os dois são publicados lado a lado.
 */
export type CompanyUser = Readonly<{
  contact: Readonly<{ channel: string; masked: string }>
  /** Mascarados na API, como o contato: servem para reconhecer a pessoa, não para reeditar. */
  email: string
  id: string
  membershipId: string
  name: string
  phone: string
  roles: readonly string[]
  status: string
  taxId: string
  username: string
  invitation?: Readonly<{ expiresAt: string; status: string }>
}>

export type CompanyUserPage = Readonly<{
  nextCursor: null | string
  users: readonly CompanyUser[]
}>

/**
 * O que a tela de sincronização mostra: cada pessoa e de que lado ela existe. `linked` está nos
 * dois; `missing-in-realm` tem vínculo aqui e não consegue entrar; `missing-locally` é conta no
 * Keycloak que ninguém desta empresa reivindica.
 */
export type ReconciliationStatus = 'linked' | 'missing-in-realm' | 'missing-locally'
export type ReconciliationMatch = 'email' | 'none' | 'subject' | 'tax-id'

export type ReconciliationEntry = Readonly<{
  local?: Readonly<{
    contact: string
    email: string
    membershipId: string
    name: string
    taxId: string
    userId: string
  }>
  matchedBy: ReconciliationMatch
  realm?: Readonly<{ email: string; enabled: boolean; subject: string; username: string }>
  status: ReconciliationStatus
}>

export type CompanyUsersReconciliation = Readonly<{
  hasMoreRealmUsers: boolean
  items: readonly ReconciliationEntry[]
}>

export type InviteCompanyUserInput = Readonly<{
  channel: ContactChannel
  contact: string
  name: string
  roles: readonly string[]
  email?: string
  phone?: string
  taxId?: string
}>

/** `no-driver-record` não é falha: o convite passou, mas a frota ainda não conhece a pessoa. */
export type FleetLink = 'linked' | 'no-driver-record' | 'not-applicable'

export type InvitedCompanyUser = CompanyUser & Readonly<{ fleetLink: FleetLink }>

export type ChangeCompanyUserStatusInput = Readonly<{
  status: CompanyUserApiStatus
  userId: string
}>

export type ReplaceCompanyUserRolesInput = Readonly<{
  roles: readonly string[]
  userId: string
}>

/** A API exige ao menos um campo; mandar o objeto inteiro apagaria o que não está na tela. */
export type UpdateCompanyUserProfileInput = Readonly<{
  userId: string
  channel?: ContactChannel
  contact?: string
  email?: string
  name?: string
  phone?: string
  taxId?: string
  username?: string
}>

export type ResendInvitationResult = Readonly<{
  expiresAt: string
  userId: string
}>
