/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COMPANY_GROUPS_PATH,
  COMPANY_USER_ERROR,
  COMPANY_USERS_PATH,
} from './companyUsers.constant'
import type {
  AssignCompanyUserRolesInput,
  AssignCompanyGroupsInput,
  AssignedCompanyUserRoles,
  ChangeCompanyUserStatusInput,
  CompanyGroup,
  SaveCompanyGroupInput,
  CompanyUser,
  CompanyUserPage,
  CompanyUsersReconciliation,
  IdentitySyncOutcome,
  InviteCompanyUserInput,
  ProfileFillOutcome,
  RealmAdoptionOutcome,
  SetCompanyUserPasswordInput,
  InvitedCompanyUser,
  ReplaceCompanyUserRolesInput,
  ResendInvitationResult,
  RevealedCompanyUser,
  RolePermissionMatrix,
  UpdateCompanyUserProfileInput,
} from './companyUsers.types'
import {
  isRecord,
  isString,
  toCompanyUser,
  toCompanyUserPage,
  toCompanyUsersReconciliation,
  toIdentitySyncOutcome,
  toInvitedCompanyUser,
  toProfileFillOutcome,
  toRealmAdoptionOutcome,
  toAssignedCompanyUserRoles,
  toCompanyGroupResponse,
  toCompanyGroups,
  toResendInvitationResult,
  toRevealedCompanyUsers,
  toRolePermissionMatrix,
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
  assignGroups: (input: AssignCompanyGroupsInput) => Promise<void>
  assignRoles: (input: AssignCompanyUserRolesInput) => Promise<AssignedCompanyUserRoles>
  grantPermissions: (
    input: Readonly<{ permissions: readonly string[]; userId: string }>,
  ) => Promise<void>
  listGroups: () => Promise<readonly CompanyGroup[]>
  listUserPermissions: (input: Readonly<{ userId: string }>) => Promise<readonly string[]>
  removeGroup: (input: Readonly<{ groupId: string }>) => Promise<void>
  revokePermissions: (
    input: Readonly<{ permissions: readonly string[]; userId: string }>,
  ) => Promise<void>
  saveGroup: (input: SaveCompanyGroupInput) => Promise<CompanyGroup>
  reconcileUsers: () => Promise<CompanyUsersReconciliation>
  /**
   * A foto é binária dos dois lados: sobe como `multipart` e desce como bytes. Ela não passa pelo
   * `authorizedRequest`, que fala JSON — e um `JSON.parse` sobre um PNG só produziria erro de
   * resposta inválida no lugar de uma imagem.
   */
  readPicture: (input: Readonly<{ userId: string }>) => Promise<Blob | null>
  removePicture: (input: Readonly<{ userId: string }>) => Promise<void>
  replacePicture: (input: Readonly<{ file: Blob; userId: string }>) => Promise<void>
  /** O caminho de volta: traz para cá login, e-mail e documento como o provedor os guarda. */
  adoptRealmFields: (
    input: Readonly<{ userIds: readonly string[] }>,
  ) => Promise<RealmAdoptionOutcome>
  /** O conserto do quarto estado: copia nome e contato da conta que já existe no provedor. */
  fillProfilesFromRealm: (
    input: Readonly<{ userIds: readonly string[] }>,
  ) => Promise<ProfileFillOutcome>
  synchronizeIdentities: (
    input: Readonly<{ subjects: readonly string[]; userIds: readonly string[] }>,
  ) => Promise<IdentitySyncOutcome>
  /** A senha vai por rota própria e não volta em eco nenhum: 204 é a resposta inteira. */
  setPassword: (input: SetCompanyUserPasswordInput) => Promise<void>
  readRolePermissions: () => Promise<RolePermissionMatrix>
  revealUsers: (
    input: Readonly<{ includeRealm?: boolean; userIds: readonly string[] }>,
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

/**
 * O `content-type` do multipart é montado pelo próprio `fetch`, com a fronteira dentro: declará-lo
 * à mão produz um corpo que o servidor não consegue separar, e o erro sai como "requisição
 * inválida" sem dizer por quê.
 */
/**
 * A resposta de erro da rota de foto é JSON, mesmo quando a de sucesso é binária. Achatar tudo em
 * "requisição falhou" jogava fora a única informação acionável que existia: arquivo grande demais e
 * formato não suportado se consertam de maneiras diferentes, e a tela não tinha como dizer qual era.
 */
async function readPictureErrorCode(response: Response): Promise<string> {
  try {
    return readErrorCode(JSON.parse(await response.text()) as unknown)
  } catch {
    return COMPANY_USER_ERROR.REQUEST_FAILED
  }
}

async function pictureRequest(
  input: Readonly<{
    body?: FormData
    dependencies: ClientDependencies
    method: RequestMethod
    userId: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  const requestInit: RequestInit = {
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
    method: input.method,
  }
  if (input.body !== undefined) requestInit.body = input.body

  try {
    return await input.dependencies.fetch(
      new Request(
        `${input.dependencies.apiUrl}${COMPANY_USERS_PATH}/${input.userId}/picture`,
        requestInit,
      ),
    )
  } catch {
    throw requestError(COMPANY_USER_ERROR.REQUEST_FAILED)
  }
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
    async assignGroups(input) {
      await authorizedRequest({
        body: JSON.stringify({ groupIds: input.groupIds, userIds: input.userIds }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_GROUPS_PATH}/assignments`,
      })
    },
    async grantPermissions(input) {
      await authorizedRequest({
        body: JSON.stringify({ permissions: input.permissions }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/${input.userId}/permissions`,
      })
    },
    async listGroups() {
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: COMPANY_GROUPS_PATH,
      })
      return toCompanyGroups(payload)
    },
    async listUserPermissions(input) {
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${COMPANY_USERS_PATH}/${input.userId}/permissions`,
      })
      return isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.permissions)
        ? payload.data.permissions.filter(isString)
        : []
    },
    async removeGroup(input) {
      await authorizedRequest({
        dependencies,
        method: 'DELETE',
        path: `${COMPANY_GROUPS_PATH}/${input.groupId}`,
      })
    },
    async revokePermissions(input) {
      await authorizedRequest({
        body: JSON.stringify({ permissions: input.permissions }),
        dependencies,
        method: 'DELETE',
        path: `${COMPANY_USERS_PATH}/${input.userId}/permissions`,
      })
    },
    async saveGroup(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({
          description: input.description,
          name: input.name,
          permissions: input.permissions,
          roles: input.roles,
        }),
        dependencies,
        method: input.groupId === undefined ? 'POST' : 'PUT',
        path:
          input.groupId === undefined
            ? COMPANY_GROUPS_PATH
            : `${COMPANY_GROUPS_PATH}/${input.groupId}`,
      })
      return toCompanyGroupResponse(payload)
    },
    async assignRoles(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({ roles: input.roles, userIds: input.userIds }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/roles`,
      })
      return toAssignedCompanyUserRoles(payload)
    },
    async readPicture(input) {
      const response = await pictureRequest({
        dependencies,
        method: 'GET',
        userId: input.userId,
      })
      /** Sem foto é ausência, não falha: a tela desenha as iniciais e segue. */
      if (response.status === 404) return null
      if (!response.ok) throw requestError(await readPictureErrorCode(response))
      return response.blob()
    },
    async removePicture(input) {
      const response = await pictureRequest({
        dependencies,
        method: 'DELETE',
        userId: input.userId,
      })
      if (!response.ok && response.status !== 404) {
        throw requestError(await readPictureErrorCode(response))
      }
    },
    async replacePicture(input) {
      const body = new FormData()
      body.set('file', input.file, 'foto')
      const response = await pictureRequest({
        body,
        dependencies,
        method: 'PUT',
        userId: input.userId,
      })
      if (!response.ok) throw requestError(await readPictureErrorCode(response))
    },
    async adoptRealmFields(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({ userIds: input.userIds }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/reconciliation/adopt`,
      })
      return toRealmAdoptionOutcome(payload)
    },
    async fillProfilesFromRealm(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({ userIds: input.userIds }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/reconciliation/profiles`,
      })
      return toProfileFillOutcome(payload)
    },
    async setPassword(input) {
      await authorizedRequest({
        body: JSON.stringify({ password: input.password, temporary: input.temporary }),
        dependencies,
        method: 'PUT',
        path: `${COMPANY_USERS_PATH}/${input.userId}/password`,
      })
    },
    async synchronizeIdentities(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({ subjects: input.subjects, userIds: input.userIds }),
        dependencies,
        method: 'POST',
        path: `${COMPANY_USERS_PATH}/reconciliation/sync`,
      })
      return toIdentitySyncOutcome(payload)
    },
    async readRolePermissions() {
      const { payload } = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${COMPANY_USERS_PATH}/role-permissions`,
      })
      return toRolePermissionMatrix(payload)
    },
    async revealUsers(input) {
      const { payload } = await authorizedRequest({
        body: JSON.stringify({
          userIds: input.userIds,
          ...(input.includeRealm === true ? { includeRealm: true } : {}),
        }),
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
