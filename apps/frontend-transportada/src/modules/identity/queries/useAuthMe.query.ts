/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'

const AUTH_ME_QUERY_KEY = ['identity', 'auth-me'] as const
const AUTH_ME_PATH = '/auth/me'
const COMPANY_ROLES = ['company-admin', 'finance', 'fiscal', 'operator', 'viewer'] as const
const COMPANY_PERMISSIONS = [
  'users.manage',
  'invoices.import',
  'invoices.read',
  'batches.create',
  'batches.approve',
  'freight.simulate',
  'cte.manage',
  'cte.submit',
  'billing.create',
  'billing.cancel',
  'billing.read',
  'settings.manage',
  'audit.read',
] as const

type CompanyRole = (typeof COMPANY_ROLES)[number]
type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number]

export type AuthMeResponse = {
  readonly data: {
    readonly company: { readonly id: string }
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
    hasStringProperty(identity, 'userId') &&
    isLiteralArray(permissions, COMPANY_PERMISSIONS) &&
    isLiteralArray(roles, COMPANY_ROLES)
  )
}

async function fetchAuthMe(): Promise<AuthMeResponse> {
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
