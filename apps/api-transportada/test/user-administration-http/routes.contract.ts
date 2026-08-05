/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CHANGE_STATUS_BODY,
  COMPANY_CONTEXT,
  COMPANY_USER,
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  INVITE_BODY,
  INVITE_CONTACT,
  jsonRequest,
  REPLACE_ROLES_BODY,
  responseData,
  TARGET_USER_ID,
} from '../fixtures/user-administration-http.fixture'

const USER_PATH = `${COMPANY_USERS_PATH}/${TARGET_USER_ID}`

describe('rotas de administração de usuários — listagem', () => {
  test('devolve a página de usuários da empresa do token', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: COMPANY_USERS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [COMPANY_USER], page: { nextCursor: null } })
    expect(fixture.listCalls).toHaveLength(1)
    expect(fixture.listCalls[0]?.['context']).toMatchObject({
      companyId: COMPANY_CONTEXT.companyId,
    })
  })

  test('mostra contato mascarado e nunca o endereço em claro', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: COMPANY_USERS_PATH }))
    const body = await response.text()

    expect(body).toContain('masked')
    expect(body).not.toContain(INVITE_CONTACT)
  })
})

describe('rotas de administração de usuários — convite', () => {
  test('cria o convite e devolve 201 sem o código de ativação', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: INVITE_BODY, method: 'POST', path: COMPANY_USERS_PATH }),
    )
    const body = await response.text()

    expect(response.status).toBe(201)
    expect(fixture.inviteCalls).toHaveLength(1)
    expect(fixture.inviteCalls[0]?.['context']).toMatchObject({
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(body).not.toContain(INVITE_CONTACT)
    expect(body.toLowerCase()).not.toContain('code')
  })

  test('recusa o convite que tenta escolher a empresa pelo corpo', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...INVITE_BODY, companyId: '00000000-0000-4000-8000-0000000009ff' },
        method: 'POST',
        path: COMPANY_USERS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.inviteCalls).toEqual([])
  })

  test('recusa perfil que não existe em COMPANY_ROLES', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...INVITE_BODY, roles: ['platform-owner'] },
        method: 'POST',
        path: COMPANY_USERS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.inviteCalls).toEqual([])
  })
})

describe('rotas de administração de usuários — reenvio de código', () => {
  test('aceita o reenvio e devolve só a nova validade', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${USER_PATH}/invitation` }),
    )
    const body = await response.text()

    expect(response.status).toBe(202)
    expect(fixture.resendCodeCalls).toHaveLength(1)
    expect(fixture.resendCodeCalls[0]).toMatchObject({ userId: TARGET_USER_ID })
    expect(body.toLowerCase()).not.toContain('code')
  })
})

describe('rotas de administração de usuários — situação e perfis', () => {
  test('ativa e desativa o usuário pela rota de situação', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CHANGE_STATUS_BODY, method: 'PATCH', path: `${USER_PATH}/status` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ status: 'suspended' })
    expect(fixture.changeStatusCalls[0]).toMatchObject({
      status: CHANGE_STATUS_BODY.status,
      userId: TARGET_USER_ID,
    })
  })

  test('recusa situação fora do contrato', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { status: 'deleted' }, method: 'PATCH', path: `${USER_PATH}/status` }),
    )

    expect(response.status).toBe(400)
    expect(fixture.changeStatusCalls).toEqual([])
  })

  test('substitui os perfis do usuário de uma vez', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: REPLACE_ROLES_BODY, method: 'PUT', path: `${USER_PATH}/roles` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ roles: [...REPLACE_ROLES_BODY.roles] })
    expect(fixture.replaceRolesCalls[0]).toMatchObject({
      roles: [...REPLACE_ROLES_BODY.roles],
      userId: TARGET_USER_ID,
    })
  })
})

describe('rotas de administração de usuários — remoção de vínculo', () => {
  test('remove o vínculo e devolve 204 sem corpo', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'DELETE', path: USER_PATH }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.removeMembershipCalls[0]).toMatchObject({ userId: TARGET_USER_ID })
  })

  test('recusa identificador de usuário que não é UUID', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${COMPANY_USERS_PATH}/nao-e-uuid` }),
    )

    expect(response.status).toBe(400)
    expect(fixture.removeMembershipCalls).toEqual([])
  })
})
