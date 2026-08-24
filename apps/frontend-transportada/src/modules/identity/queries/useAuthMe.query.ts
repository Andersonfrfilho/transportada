/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'
import { isSmokeAuthBypassEnabled } from '../shared/smokeAuthBypass.service'

const AUTH_ME_QUERY_KEY = ['identity', 'auth-me'] as const
const AUTH_ME_PATH = '/auth/me'
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'
const COMPANY_ROLES = [
  'company-admin',
  'finance',
  'fiscal',
  'operator',
  'viewer',
  'driver',
  'aggregate',
  'separator',
] as const
const COMPANY_PERMISSIONS = [
  'users.manage',
  'invoices.import',
  'invoices.read',
  'batches.create',
  'batches.approve',
  'freight.simulate',
  'cte.manage',
  'cte.submit',
  'cte.issue',
  'cte.cancel',
  'cte.read',
  'billing.create',
  'billing.cancel',
  'billing.read',
  'settings.manage',
  'operations.read',
  'audit.read',
  'view-preferences.manage',
  'addresses.read',
  'fleet.read',
  'fleet.manage',
  'mdfe.read',
  'mdfe.manage',
  'mdfe.issue',
  'mdfe.close',
  'mdfe.cancel',
  'nfse.manage',
  'nfse.issue',
  'nfse.cancel',
  'nfse.read',
  'trip.read',
  'trip.manage',
  'trip.report',
] as const

const FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const

type CompanyRole = (typeof COMPANY_ROLES)[number]
type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number]
export type FiscalEnvironment = (typeof FISCAL_ENVIRONMENTS)[number]

export type AuthMeResponse = {
  readonly data: {
    /**
     * `null` enquanto a empresa não tem cadastro fiscal, ausente enquanto a API for de um deploy
     * anterior ao campo — em nenhum dos dois casos a tela inteira deve cair por causa de um selo.
     */
    readonly company: {
      readonly fiscalEnvironment?: FiscalEnvironment | null
      readonly id: string
    }
    readonly identity: { readonly userId: string }
    readonly permissions: readonly CompanyPermission[]
    readonly roles: readonly CompanyRole[]
  }
}

function isLiteralArray<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
): value is readonly TValue[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && allowedValues.includes(item as TValue))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiscalEnvironment(value: unknown): value is FiscalEnvironment | null | undefined {
  return (
    value === null ||
    value === undefined ||
    FISCAL_ENVIRONMENTS.includes(value as FiscalEnvironment)
  )
}

function hasStringProperty(value: unknown, property: string): boolean {
  return isRecord(value) && typeof value[property] === 'string'
}

export function isAuthMeResponse(value: unknown): value is AuthMeResponse {
  if (!isRecord(value) || !('data' in value) || !isRecord(value.data)) {
    return false
  }

  const { data } = value
  const { company, identity, permissions, roles } = data
  return (
    hasStringProperty(company, 'id') &&
    isFiscalEnvironment(isRecord(company) ? company.fiscalEnvironment : undefined) &&
    hasStringProperty(identity, 'userId') &&
    isLiteralArray(permissions, COMPANY_PERMISSIONS) &&
    isLiteralArray(roles, COMPANY_ROLES)
  )
}

function readSmokeAuthMe(): AuthMeResponse {
  const serialized = window.sessionStorage.getItem(SMOKE_AUTH_ME_STORAGE_KEY)
  if (serialized === null) {
    throw new Error('IDENTITY_SMOKE_AUTH_ME_MISSING')
  }

  const responseBody: unknown = JSON.parse(serialized)
  if (!isAuthMeResponse(responseBody)) {
    throw new Error('IDENTITY_SMOKE_AUTH_ME_INVALID')
  }

  return responseBody
}

async function fetchAuthMe(): Promise<AuthMeResponse> {
  if (isSmokeAuthBypassEnabled()) {
    return readSmokeAuthMe()
  }

  const accessToken = await getKeycloakAuthProvider().getAccessToken()
  const { apiBaseUrl } = getIdentityEnvironment()
  const response = await fetch(`${apiBaseUrl}${AUTH_ME_PATH}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error('IDENTITY_AUTH_ME_UNAVAILABLE')
  }

  const responseBody: unknown = JSON.parse(await response.text())
  if (!isAuthMeResponse(responseBody)) {
    throw new Error('IDENTITY_AUTH_ME_INVALID')
  }

  return responseBody
}

export function useAuthMeQuery() {
  return useQuery({ queryFn: fetchAuthMe, queryKey: AUTH_ME_QUERY_KEY })
}
