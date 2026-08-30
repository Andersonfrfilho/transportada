/* Copyright (c) 2026 Ada Technology. MIT License. */
import { COMPANY_USER_ERROR } from './companyUsers.constant'
import type {
  CompanyUser,
  CompanyUserPage,
  CompanyUsersReconciliation,
  FleetLink,
  InvitedCompanyUser,
  ReconciliationEntry,
  ReconciliationMatch,
  ReconciliationStatus,
  ResendInvitationResult,
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

  return {
    contact: readContact(value.contact),
    id: readString(value, 'id'),
    ...(invitation === undefined ? {} : { invitation }),
    email: readString(value, 'email'),
    membershipId: readString(value, 'membershipId'),
    name: readString(value, 'name'),
    phone: readString(value, 'phone'),
    roles: readStringArray(value, 'roles'),
    status: readString(value, 'status'),
    taxId: readString(value, 'taxId'),
    username: readString(value, 'username'),
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
const RECONCILIATION_MATCHES = ['email', 'none', 'subject', 'tax-id'] as const

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

export function toResendInvitationResult(value: unknown): ResendInvitationResult {
  if (!isRecord(value)) invalid()
  return { expiresAt: readString(value, 'expiresAt'), userId: readString(value, 'userId') }
}
