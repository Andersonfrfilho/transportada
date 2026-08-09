/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CHANGE_STATUS_BODY,
  COMPANY_CONTEXT,
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  INVITE_BODY,
  jsonRequest,
  OTHER_COMPANY_USER_ID,
  REPLACE_ROLES_BODY,
  responseApiError,
  TARGET_USER_ID,
  UPDATE_PROFILE_BODY,
  WITHOUT_USERS_MANAGE_PERMISSIONS,
} from '../fixtures/user-administration-http.fixture'

const USER_PATH = `${COMPANY_USERS_PATH}/${TARGET_USER_ID}`
const OTHER_USER_PATH = `${COMPANY_USERS_PATH}/${OTHER_COMPANY_USER_ID}`

const administrationRequests = (userPath: string): readonly Request[] => [
  jsonRequest({ method: 'GET', path: COMPANY_USERS_PATH }),
  jsonRequest({ body: INVITE_BODY, method: 'POST', path: COMPANY_USERS_PATH }),
  jsonRequest({ method: 'POST', path: `${userPath}/invitation` }),
  jsonRequest({ body: CHANGE_STATUS_BODY, method: 'PATCH', path: `${userPath}/status` }),
  jsonRequest({ body: REPLACE_ROLES_BODY, method: 'PUT', path: `${userPath}/roles` }),
  jsonRequest({ body: UPDATE_PROFILE_BODY, method: 'PATCH', path: userPath }),
  jsonRequest({ method: 'DELETE', path: userPath }),
]

describe('segurança das rotas de administração de usuários — permissão', () => {
  test('recusa as sete rotas a quem administra a empresa sem users.manage', async () => {
    const fixture = await createUserAdministrationHttpFixture({
      permissions: WITHOUT_USERS_MANAGE_PERMISSIONS,
    })

    const responses = []
    for (const request of administrationRequests(USER_PATH)) {
      responses.push(await fixture.handle(request))
    }

    expect(responses).toHaveLength(7)
    for (const response of responses) expect(response.status).toBe(403)
    expect((await responseApiError(responses[0]!)).code).toBe('FORBIDDEN')
    expect(fixture.changeStatusCalls).toEqual([])
    expect(fixture.inviteCalls).toEqual([])
    expect(fixture.listCalls).toEqual([])
    expect(fixture.removeMembershipCalls).toEqual([])
    expect(fixture.replaceRolesCalls).toEqual([])
    expect(fixture.resendCodeCalls).toEqual([])
    expect(fixture.updateProfileCalls).toEqual([])
  })

  test('atende as sete rotas a quem tem users.manage', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const responses = []
    for (const request of administrationRequests(USER_PATH)) {
      responses.push(await fixture.handle(request))
    }

    for (const response of responses) expect(response.status).toBeLessThan(400)
  })
})

describe('segurança das rotas de administração de usuários — escopo do token', () => {
  test('leva a empresa do token a todo use case, em toda rota', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    for (const request of administrationRequests(USER_PATH)) await fixture.handle(request)

    const calls = [
      ...fixture.changeStatusCalls,
      ...fixture.inviteCalls,
      ...fixture.listCalls,
      ...fixture.removeMembershipCalls,
      ...fixture.replaceRolesCalls,
      ...fixture.resendCodeCalls,
      ...fixture.updateProfileCalls,
    ]

    expect(calls).toHaveLength(7)
    for (const call of calls) {
      expect(call['context']).toMatchObject({ companyId: COMPANY_CONTEXT.companyId })
    }
  })

  test('recusa a empresa vinda do cliente na query da listagem', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${COMPANY_USERS_PATH}?companyId=outra` }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.listCalls).toEqual([])
  })
})

describe('segurança das rotas de administração de usuários — recusas de domínio', () => {
  test('responde 404 sobre usuário de outra empresa, sem confirmar que ele existe', async () => {
    const fixture = await createUserAdministrationHttpFixture({ refusal: 'cross-tenant' })

    const responses = []
    for (const request of administrationRequests(OTHER_USER_PATH).slice(2)) {
      responses.push(await fixture.handle(request))
    }

    for (const response of responses) expect(response.status).toBe(404)
    const error = await responseApiError(responses[0]!)
    expect(error.code).toBe('COMPANY_USER_NOT_FOUND')
    expect(error.message).not.toContain(OTHER_COMPANY_USER_ID)
    expect(error.message).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('recusa com 409 tirar o último company-admin da empresa', async () => {
    const fixture = await createUserAdministrationHttpFixture({ refusal: 'last-admin' })

    const rolesResponse = await fixture.handle(
      jsonRequest({ body: REPLACE_ROLES_BODY, method: 'PUT', path: `${USER_PATH}/roles` }),
    )
    const removeResponse = await fixture.handle(jsonRequest({ method: 'DELETE', path: USER_PATH }))

    expect(rolesResponse.status).toBe(409)
    expect(removeResponse.status).toBe(409)
    expect((await responseApiError(rolesResponse)).code).toBe('LAST_COMPANY_ADMIN')
    expect((await responseApiError(removeResponse)).code).toBe('LAST_COMPANY_ADMIN')
  })

  test('recusa com 409 o administrador remover o próprio vínculo', async () => {
    const fixture = await createUserAdministrationHttpFixture({ refusal: 'self-removal' })

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${COMPANY_USERS_PATH}/${COMPANY_CONTEXT.userId}` }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('SELF_MEMBERSHIP_REMOVAL')
  })
})
