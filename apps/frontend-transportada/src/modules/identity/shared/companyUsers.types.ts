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
/** A ficha de motorista que o vínculo referencia, e os veículos atribuídos a ela. */
export type CompanyUserFleetLink = Readonly<{
  driverId: string
  vehicles: readonly Readonly<{ id: string; plate: string }>[]
}>

export type CompanyUser = Readonly<{
  contact: Readonly<{ channel: string; masked: string }>
  /** Mascarados na API, como o contato: servem para reconhecer a pessoa, não para reeditar. */
  email: string
  /** Todos os endereços da pessoa, mascarados. Um só na célula esconderia os outros. */
  emails: readonly string[]
  id: string
  membershipId: string
  name: string
  phone: string
  roles: readonly string[]
  status: string
  taxId: string
  username: string
  fleet?: CompanyUserFleetLink
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
/**
 * Os três primeiros falam de **existência**; `profile-missing` fala de **completude** — a conta
 * existe dos dois lados e a ficha daqui está vazia. Sem ele a tela dizia "Sincronizado" para quem a
 * listagem mostrava como "Cadastro incompleto".
 */
export type ReconciliationStatus =
  | 'linked'
  | 'missing-in-realm'
  | 'missing-locally'
  | 'profile-missing'
export type ReconciliationMatch = 'email' | 'none' | 'subject' | 'document'

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

/** O que cada papel alcança, servido da mesma constante que o `authorize` da API consulta. */
export type RolePermissionMatrix = Readonly<{
  permissions: readonly string[]
  roles: readonly Readonly<{ permissions: readonly string[]; role: string }>[]
}>

export type CompanyGroup = Readonly<{
  description: string
  id: string
  /** Nulo enquanto o grupo não existe no realm: a tela mostra pendente em vez de fingir que bate. */
  keycloakGroupId: string | null
  memberCount: number
  name: string
  permissions: readonly string[]
  roles: readonly string[]
}>

export type SaveCompanyGroupInput = Readonly<{
  description: string
  groupId?: string
  name: string
  permissions: readonly string[]
  roles: readonly string[]
}>

export type AssignCompanyGroupsInput = Readonly<{
  groupIds: readonly string[]
  userIds: readonly string[]
}>

export type AssignCompanyUserRolesInput = Readonly<{
  roles: readonly string[]
  userIds: readonly string[]
}>

/** Quem o lote alcançou. Id fora da empresa não entra, e não vira erro. */
export type AssignedCompanyUserRoles = Readonly<{ affectedUserIds: readonly string[] }>

/** O valor cru de quem a tela pediu para revelar. Só chega a quem tem `users.reveal`. */
export type RevealedCompanyUser = Readonly<{
  contact: string
  email: string
  name: string
  phone: string
  taxId: string
  userId: string
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

/**
 * O que o conserto alcançou, e o que ele pulou. A API devolve os dois desde sempre; descartar o
 * corpo fazia o operador clicar e ver a tela igual, sem nada dizendo que o pulo foi deliberado.
 */
export type ProfileFillOutcome = Readonly<{
  filled: readonly string[]
  skipped: readonly Readonly<{ reason: string; userId: string }>[]
}>

export type IdentitySyncOutcome = Readonly<{
  createdInRealm: readonly string[]
  createdLocally: readonly string[]
  skipped: readonly Readonly<{ reason: string; subject: string }>[]
}>

/**
 * `temporary` é escolha explícita de quem administra: definitiva serve a quem está sem canal de
 * e-mail, temporária obriga a troca no primeiro login.
 */
export type SetCompanyUserPasswordInput = Readonly<{
  password: string
  temporary: boolean
  userId: string
}>

export type ResendInvitationResult = Readonly<{
  expiresAt: string
  userId: string
}>
