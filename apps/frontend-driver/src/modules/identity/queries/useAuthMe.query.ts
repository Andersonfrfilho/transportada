/* Cópia por valor, reduzida, de apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ Reduzida: o painel valida `roles`/`permissions` contra um catálogo fechado de dezenas de
 * papéis e permissões de escritório — vocabulário que este app não tem uso para. O Perfil do
 * motorista (`DriverProfile.page.tsx`) só lê `data.roles`, então é só isso que se valida aqui.
 * `trip.read` já é conferido pela API (RF3, `checkDriverAuthorization`), não por este tipo.
 */
import { useQuery } from '@tanstack/react-query'

import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { isSmokeAuthBypassEnabled } from '../shared/smokeAuthBypass.service'

export const AUTH_ME_QUERY_KEY = ['identity', 'auth-me'] as const
const AUTH_ME_PATH = '/auth/me'
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

export type AuthMeResponse = {
  readonly data: {
    readonly roles: readonly string[]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isAuthMeResponse(value: unknown): value is AuthMeResponse {
  if (!isRecord(value) || !('data' in value) || !isRecord(value.data)) {
    return false
  }

  return isStringArray(value.data.roles)
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
  const { apiBaseUrl } = getDriverEnvironment()
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
