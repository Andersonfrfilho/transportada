/* Copyright (c) 2026 Ada Technology. MIT License. */
import { COMPANY_USER_ERROR } from './companyUsers.constant'
import type {
  CompanyUser,
  CompanyUserPage,
  CompanyUserFleetLink,
  CompanyUsersReconciliation,
  FleetLink,
  InvitedCompanyUser,
  ReconciliationEntry,
  ReconciliationMatch,
  ReconciliationStatus,
  AssignedCompanyUserRoles,
  CompanyGroup,
  ResendInvitationResult,
  RevealedCompanyUser,
  RolePermissionMatrix,
} from './companyUsers.types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function invalid(): never {
  throw new Error(COMPANY_USER_ERROR.RESPONSE_INVALID)
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return isString(value) ? value : invalid()
}

function readStringArray(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key]
  if (!Array.isArray(value) || !value.every(isString)) invalid()
  return value
}

/**
 * Campo obrigatório é conferido; chave extra é ignorada. Guarda de chaves exatas transforma um
 * campo novo da API em tela inteira quebrada, com todas as respostas ainda respondendo 200.
 */
function readInvitation(value: unknown): CompanyUser['invitation'] {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) invalid()
  return { expiresAt: readString(value, 'expiresAt'), status: readString(value, 'status') }
}

function readContact(value: unknown): CompanyUser['contact'] {
  if (!isRecord(value)) invalid()
  return { channel: readString(value, 'channel'), masked: readString(value, 'masked') }
}

export function toCompanyUser(value: unknown): CompanyUser {
  if (!isRecord(value)) invalid()
  const invitation = readInvitation(value.invitation)
  const fleet = readFleetLink(value.fleet)

  return {
    contact: readContact(value.contact),
    ...(fleet === undefined ? {} : { fleet }),
    id: readString(value, 'id'),
    ...(invitation === undefined ? {} : { invitation }),
    email: readString(value, 'email'),
    emails: Array.isArray(value.emails) ? value.emails.map(readText) : [],
    membershipId: readString(value, 'membershipId'),
    name: readString(value, 'name'),
    phone: readString(value, 'phone'),
    roles: readStringArray(value, 'roles'),
    status: readString(value, 'status'),
    taxId: readString(value, 'taxId'),
    username: readString(value, 'username'),
  }
}

/**
 * Vínculo ausente é ausência de link, não linha quebrada: a tela só mostra o caminho quando ele
 * leva a algum lugar. Veículo sem placa é descartado — um link com rótulo vazio não é clicável.
 */
function readFleetLink(value: unknown): CompanyUserFleetLink | undefined {
  if (!isRecord(value) || !isString(value.driverId) || value.driverId === '') return undefined
  const vehicles = Array.isArray(value.vehicles) ? value.vehicles : []

  return {
    driverId: value.driverId,
    vehicles: vehicles.flatMap((vehicle) =>
      isRecord(vehicle) && isString(vehicle.id) && isString(vehicle.plate) && vehicle.plate !== ''
        ? [{ id: vehicle.id, plate: vehicle.plate }]
        : [],
    ),
  }
}

const FLEET_LINKS: readonly FleetLink[] = ['linked', 'no-driver-record', 'not-applicable']

/**
 * Valor desconhecido cai em `not-applicable` em vez de derrubar a tela: o convite já foi criado
 * quando esta resposta chega, e recusá-la faria o operador achar que nada aconteceu.
 */
export function toInvitedCompanyUser(value: unknown): InvitedCompanyUser {
  const user = toCompanyUser(value)
  const fleetLink = isRecord(value) ? value.fleetLink : undefined
  return {
    ...user,
    fleetLink: FLEET_LINKS.find((link) => link === fleetLink) ?? 'not-applicable',
  }
}

export function toCompanyUserPage(value: unknown): CompanyUserPage {
  if (!isRecord(value) || !Array.isArray(value.data)) invalid()
  const page: unknown = value.page
  const nextCursor = isRecord(page) ? page.nextCursor : null

  return {
    nextCursor: isString(nextCursor) ? nextCursor : null,
    users: value.data.map(toCompanyUser),
  }
}

const RECONCILIATION_STATUSES = ['linked', 'missing-in-realm', 'missing-locally'] as const
const RECONCILIATION_MATCHES = ['email', 'none', 'subject', 'document'] as const

/**
 * Status desconhecido não derruba a tela: a linha continua visível como `missing-locally`, que é o
 * pior caso e o que pede ação. Sumir com a pessoa é o defeito que esta tela existe para consertar.
 */
function toReconciliationStatus(value: unknown): ReconciliationStatus {
  return RECONCILIATION_STATUSES.find((status) => status === value) ?? 'missing-locally'
}

function toReconciliationMatch(value: unknown): ReconciliationMatch {
  return RECONCILIATION_MATCHES.find((match) => match === value) ?? 'none'
}

function toReconciliationEntry(value: unknown): ReconciliationEntry {
  if (!isRecord(value)) invalid()
  const local = isRecord(value.local) ? value.local : undefined
  const realm = isRecord(value.realm) ? value.realm : undefined

  return {
    matchedBy: toReconciliationMatch(value.matchedBy),
    status: toReconciliationStatus(value.status),
    ...(local === undefined
      ? {}
      : {
          local: {
            contact: readText(local.contact),
            email: readText(local.email),
            membershipId: readText(local.membershipId),
            name: readText(local.name),
            taxId: readText(local.taxId),
            userId: readText(local.userId),
          },
        }),
    ...(realm === undefined
      ? {}
      : {
          realm: {
            email: readText(realm.email),
            enabled: realm.enabled === true,
            subject: readText(realm.subject),
            username: readText(realm.username),
          },
        }),
  }
}

function readText(value: unknown): string {
  return isString(value) ? value : ''
}

export function toCompanyUsersReconciliation(value: unknown): CompanyUsersReconciliation {
  if (!isRecord(value) || !isRecord(value.data)) invalid()
  const data = value.data
  if (!Array.isArray(data.items)) invalid()

  return {
    hasMoreRealmUsers: data.hasMoreRealmUsers === true,
    items: data.items.map(toReconciliationEntry),
  }
}

export function toRolePermissionMatrix(value: unknown): RolePermissionMatrix {
  if (!isRecord(value) || !isRecord(value.data)) invalid()
  const data = value.data
  if (!Array.isArray(data.permissions) || !Array.isArray(data.roles)) invalid()

  return {
    permissions: data.permissions.map(readText),
    roles: data.roles.map((entry) => {
      if (!isRecord(entry) || !Array.isArray(entry.permissions)) invalid()
      return { permissions: entry.permissions.map(readText), role: readText(entry.role) }
    }),
  }
}

export function toCompanyGroups(value: unknown): readonly CompanyGroup[] {
  if (!isRecord(value) || !Array.isArray(value.data)) invalid()
  return value.data.map(toCompanyGroup)
}

export function toCompanyGroupResponse(value: unknown): CompanyGroup {
  if (!isRecord(value)) invalid()
  return toCompanyGroup(value.data)
}

function toCompanyGroup(value: unknown): CompanyGroup {
  if (!isRecord(value)) invalid()
  return {
    description: readText(value.description),
    id: readText(value.id),
    keycloakGroupId: isString(value.keycloakGroupId) ? value.keycloakGroupId : null,
    memberCount: typeof value.memberCount === 'number' ? value.memberCount : 0,
    name: readText(value.name),
    permissions: Array.isArray(value.permissions) ? value.permissions.map(readText) : [],
    roles: Array.isArray(value.roles) ? value.roles.map(readText) : [],
  }
}

export function toAssignedCompanyUserRoles(value: unknown): AssignedCompanyUserRoles {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.affectedUserIds)) {
    invalid()
  }
  return { affectedUserIds: value.data.affectedUserIds.map(readText) }
}

export function toRevealedCompanyUsers(value: unknown): readonly RevealedCompanyUser[] {
  if (!isRecord(value) || !Array.isArray(value.data)) invalid()

  return value.data.map((entry) => {
    if (!isRecord(entry)) invalid()
    return {
      contact: readText(entry.contact),
      email: readText(entry.email),
      name: readText(entry.name),
      phone: readText(entry.phone),
      taxId: readText(entry.taxId),
      userId: readText(entry.userId),
    }
  })
}

export function toResendInvitationResult(value: unknown): ResendInvitationResult {
  if (!isRecord(value)) invalid()
  return { expiresAt: readString(value, 'expiresAt'), userId: readString(value, 'userId') }
}
