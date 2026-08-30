/* Copyright (c) 2026 Ada Technology. MIT License. */
import { COMPANY_USER_ERROR, COMPANY_USERS_PATH } from './companyUsers.constant'
import type {
  ChangeCompanyUserStatusInput,
  CompanyUser,
  CompanyUserPage,
  CompanyUsersReconciliation,
  InviteCompanyUserInput,
  InvitedCompanyUser,
  ReplaceCompanyUserRolesInput,
  ResendInvitationResult,
  RevealedCompanyUser,
  UpdateCompanyUserProfileInput,
} from './companyUsers.types'
import {
  isRecord,
  isString,
  toCompanyUser,
  toCompanyUserPage,
  toCompanyUsersReconciliation,
  toInvitedCompanyUser,
  toResendInvitationResult,
  toRevealedCompanyUsers,
} from './companyUsersResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
  newIdempotencyKey: () => string
}>

export type CompanyUsersClient = Readonly<{
  changeStatus: (input: ChangeCompanyUserStatusInput) => Promise<CompanyUser>
  inviteUser: (input: InviteCompanyUserInput) => Promise<InvitedCompanyUser>
  listUsers: (input: Readonly<{ cursor: null | string; limit: number }>) => Promise<CompanyUserPage>
  reconcileUsers: () => Promise<CompanyUsersReconciliation>
  revealUsers: (
    input: Readonly<{ userIds: readonly string[] }>,
  ) => Promise<readonly RevealedCompanyUser[]>
  removeUser: (input: Readonly<{ userId: string }>) => Promise<void>
  replaceRoles: (input: ReplaceCompanyUserRolesInput) => Promise<CompanyUser>
  resendInvitation: (input: Readonly<{ userId: string }>) => Promise<ResendInvitationResult>
  updateProfile: (input: UpdateCompanyUserProfileInput) => Promise<CompanyUser>
}>

type RequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return COMPANY_USER_ERROR.REQUEST_FAILED
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: RequestMethod
    path: string
  }>,
): Promise<Readonly<{ payload: unknown; rawBody: string }>> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
    )
  } catch {
    throw requestError(COMPANY_USER_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  if (rawBody.length === 0) {
    if (!response.ok) throw requestError(COMPANY_USER_ERROR.REQUEST_FAILED)
    return { payload: undefined, rawBody }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(
      response.ok ? COMPANY_USER_ERROR.RESPONSE_INVALID : COMPANY_USER_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return { payload, rawBody }
}

function readEnvelopeData(payload: unknown): unknown {
  if (!isRecord(payload) || !('data' in payload)) {
    throw requestError(COMPANY_USER_ERROR.RESPONSE_INVALID)
  }
  return payload.data
}

/** A rota exige ao menos um campo, e chave ausente é o que diz "não mexa neste dado". */
function buildProfileBody(input: UpdateCompanyUserProfileInput): Record<string, string> {
  const body: Record<string, string> = {}
  if (input.channel !== undefined) body.channel = input.channel
  if (input.contact !== undefined) body.contact = input.contact
  if (input.email !== undefined) body.email = input.email
  if (input.name !== undefined) body.name = input.name
  if (input.phone !== undefined) body.phone = input.phone
  if (input.taxId !== undefined) body.taxId = input.taxId
  if (input.username !== undefined) body.username = input.username
  return body
}

export function createCompanyUsersClient(dependencies: ClientDependencies): CompanyUsersClient {
  async function requestUser(
    input: Readonly<{ body: string; method: RequestMethod; path: string }>,
  ): Promise<CompanyUser> {
    const { payload } = await authorizedRequest({ ...input, dependencies })
    return toCompanyUser(readEnvelopeData(payload))
  }

  return {
    changeStatus: (input) =>
      requestUser({
        body: JSON.stringify({ status: input.status }),
        method: 'PATCH',
        path: `${COMPANY_USERS_PATH}/${input.userId}/status`,
      }),
    async inviteUser(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({
          channel: input.channel,
          contact: input.contact,
          name: input.name,
          roles: input.roles,
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.taxId === undefined ? {} : { taxId: input.taxId }),
        }),
        dependencies,
        idempotencyKey: dependencies.newIdempotencyKey(),
        method: 'POST',
        path: COMPANY_USERS_PATH,
      })
      return toInvitedCompanyUser(readEnvelopeData(payload))
    },
    async listUsers(input) {
      const search = new URLSearchParams()
      if (input.cursor !== null) search.set('cursor', input.cursor)
      search.set('limit', String(input.limit))
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${COMPANY_USERS_PATH}?${search.toString()}`,
      })
      return toCompanyUserPage(payload)
    },
    async reconcileUsers() {
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${COMPANY_USERS_PATH}/reconciliation`,
      })
      return toCompanyUsersReconciliation(payload)
    },
    async revealUsers(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({ userIds: input.userIds }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/reveal`,
      })
      return toRevealedCompanyUsers(payload)
    },
    async removeUser(input) {
      await authorizedRequest({
        dependencies,
        method: 'DELETE',
        path: `${COMPANY_USERS_PATH}/${input.userId}`,
      })
    },
    replaceRoles: (input) =>
      requestUser({
        body: JSON.stringify({ roles: input.roles }),
        method: 'PUT',
        path: `${COMPANY_USERS_PATH}/${input.userId}/roles`,
      }),
    async resendInvitation(input) {
      const { payload } = await authorizedRequest({
        dependencies,
        idempotencyKey: dependencies.newIdempotencyKey(),
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/${input.userId}/invitation`,
      })
      return toResendInvitationResult(readEnvelopeData(payload))
    },
    updateProfile: (input) =>
      requestUser({
        body: JSON.stringify(buildProfileBody(input)),
        method: 'PATCH',
        path: `${COMPANY_USERS_PATH}/${input.userId}`,
      }),
  }
}
