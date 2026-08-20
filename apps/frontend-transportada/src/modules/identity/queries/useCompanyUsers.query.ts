/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'

const COMPANY_USERS_QUERY_KEY = ['identity', 'company-users'] as const
const COMPANY_USERS_PATH = '/company-users'
const COMPANY_USER_STATUSES = ['invited', 'active', 'suspended'] as const

/** O teto que a API aceita em `limit` — pedir mais é 400, e pedir menos multiplica as páginas. */
const PAGE_LIMIT = 100

/**
 * A lista alimenta um campo de escolha, não um relatório: quem tem mais de mil vínculos na empresa
 * escolhe pela busca do próprio campo, e o teto evita varrer a base inteira a cada abertura de tela.
 */
const MAXIMUM_PAGES = 10

export type CompanyUserStatus = (typeof COMPANY_USER_STATUSES)[number]

export type CompanyUserSummary = {
  /** O `id` é a pessoa; `membershipId` é o vínculo dela com a empresa, e é ele que a frota guarda. */
  readonly id: string
  readonly membershipId: string
  readonly name: string
  readonly status: CompanyUserStatus
  readonly username: string
}

type CompanyUsersPage = {
  readonly data: readonly CompanyUserSummary[]
  readonly page: { readonly nextCursor: null | string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCompanyUserSummary(value: unknown): value is CompanyUserSummary {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.membershipId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.username === 'string' &&
    COMPANY_USER_STATUSES.includes(value.status as CompanyUserStatus)
  )
}

function isCompanyUsersPage(value: unknown): value is CompanyUsersPage {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.page)) return false

  const { nextCursor } = value.page
  return (
    (nextCursor === null || typeof nextCursor === 'string') &&
    value.data.every(isCompanyUserSummary)
  )
}

async function fetchPage(input: {
  readonly accessToken: string
  readonly apiBaseUrl: string
  readonly cursor: null | string
}): Promise<CompanyUsersPage> {
  const url = new URL(`${input.apiBaseUrl}${COMPANY_USERS_PATH}`)
  url.searchParams.set('limit', String(PAGE_LIMIT))
  if (input.cursor !== null) url.searchParams.set('cursor', input.cursor)

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  })

  if (!response.ok) {
    throw new Error('IDENTITY_COMPANY_USERS_UNAVAILABLE')
  }

  const responseBody: unknown = JSON.parse(await response.text())
  if (!isCompanyUsersPage(responseBody)) {
    throw new Error('IDENTITY_COMPANY_USERS_INVALID')
  }

  return responseBody
}

async function fetchCompanyUsers(): Promise<readonly CompanyUserSummary[]> {
  const accessToken = await getKeycloakAuthProvider().getAccessToken()
  const { apiBaseUrl } = getIdentityEnvironment()
  const users: CompanyUserSummary[] = []
  let cursor: null | string = null

  for (let page = 0; page < MAXIMUM_PAGES; page += 1) {
    const result = await fetchPage({ accessToken, apiBaseUrl, cursor })
    users.push(...result.data)
    cursor = result.page.nextCursor
    if (cursor === null) break
  }

  return users
}

export function useCompanyUsersQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery({
    enabled: input.enabled,
    queryFn: fetchCompanyUsers,
    queryKey: COMPANY_USERS_QUERY_KEY,
  })
}
