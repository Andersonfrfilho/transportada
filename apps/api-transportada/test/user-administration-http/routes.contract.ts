/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { toCompanyUserView } from '../../src/identity/domain/company-user.policy.js'
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
  responseApiError,
  responseData,
  TARGET_MEMBERSHIP_ID,
  TARGET_USER_ID,
  UPDATE_PROFILE_BODY,
  UPDATED_CONTACT,
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

  /**
   * `id` é a pessoa e `membershipId` é o vínculo dela com a empresa: são chaves diferentes, e é o
   * vínculo que o motorista da frota referencia. Publicar só uma delas obrigava a digitar o UUID.
   */
  test('publica o vínculo ao lado da pessoa, com chaves distintas', () => {
    const view = toCompanyUserView({
      contactAddress: 'pessoa@empresa.test',
      contactChannel: 'email',
      email: 'pessoa@empresa.test',
      membershipId: TARGET_MEMBERSHIP_ID,
      membershipStatus: 'active',
      name: 'Pessoa Convidada',
      pendingInvitation: undefined,
      phone: '',
      roles: ['fiscal'],
      taxId: '',
      userId: TARGET_USER_ID,
      username: TARGET_USER_ID,
    })

    expect(view.membershipId).toBe(TARGET_MEMBERSHIP_ID)
    expect(view.id).toBe(TARGET_USER_ID)
    expect(view.membershipId).not.toBe(view.id)
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

  /** `membership_roles` tem PK `(membership_id, role)`: papel repetido no corpo seria 500. */
  test('papel repetido no corpo chega uma vez só ao caso de uso', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...INVITE_BODY, roles: ['fiscal', 'operator', 'fiscal'] },
        method: 'POST',
        path: COMPANY_USERS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.inviteCalls[0]?.roles).toEqual(['fiscal', 'operator'])
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

  test('papel repetido na substituição chega uma vez só ao caso de uso', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { roles: ['operator', 'fiscal', 'operator'] },
        method: 'PUT',
        path: `${USER_PATH}/roles`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.replaceRolesCalls[0]?.roles).toEqual(['operator', 'fiscal'])
  })
})

describe('rotas de administração de usuários — edição de perfil', () => {
  test('altera nome, username, e-mail, canal e endereço de contato de uma vez', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_PROFILE_BODY, method: 'PATCH', path: USER_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({
      name: UPDATE_PROFILE_BODY.name,
      username: UPDATE_PROFILE_BODY.username,
    })
    expect(fixture.updateProfileCalls[0]).toMatchObject({
      channel: UPDATE_PROFILE_BODY.channel,
      contact: UPDATE_PROFILE_BODY.contact,
      email: UPDATE_PROFILE_BODY.email,
      name: UPDATE_PROFILE_BODY.name,
      userId: TARGET_USER_ID,
      username: UPDATE_PROFILE_BODY.username,
    })
  })

  test('aceita alterar um campo só, sem exigir o perfil inteiro', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { username: UPDATE_PROFILE_BODY.username },
        method: 'PATCH',
        path: USER_PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(Object.keys(fixture.updateProfileCalls[0] ?? {}).sort()).toEqual([
      'context',
      'userId',
      'username',
    ])
  })

  /** O endereço de contato é dado pessoal: entra na requisição, nunca volta em claro na resposta. */
  test('devolve o contato mascarado, nunca o endereço que acabou de receber', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_PROFILE_BODY, method: 'PATCH', path: USER_PATH }),
    )

    expect(await response.text()).not.toContain(UPDATED_CONTACT)
  })

  test('recusa a edição que tenta escolher a empresa ou o vínculo pelo corpo', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const responses = [
      await fixture.handle(
        jsonRequest({
          body: { ...UPDATE_PROFILE_BODY, companyId: '00000000-0000-4000-8000-0000000009ff' },
          method: 'PATCH',
          path: USER_PATH,
        }),
      ),
      await fixture.handle(
        jsonRequest({
          body: { ...UPDATE_PROFILE_BODY, roles: ['company-admin'] },
          method: 'PATCH',
          path: USER_PATH,
        }),
      ),
    ]

    for (const response of responses) expect(response.status).toBe(400)
    expect(fixture.updateProfileCalls).toEqual([])
  })

  test('recusa corpo vazio, nome em branco e canal fora do contrato', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const responses = [
      await fixture.handle(jsonRequest({ body: {}, method: 'PATCH', path: USER_PATH })),
      await fixture.handle(
        jsonRequest({ body: { name: '   ' }, method: 'PATCH', path: USER_PATH }),
      ),
      await fixture.handle(
        jsonRequest({ body: { channel: 'pombo-correio' }, method: 'PATCH', path: USER_PATH }),
      ),
    ]

    for (const response of responses) expect(response.status).toBe(400)
    expect(fixture.updateProfileCalls).toEqual([])
  })

  test('recusa com 409 o username já usado por outra pessoa', async () => {
    const fixture = await createUserAdministrationHttpFixture({ refusal: 'duplicate-username' })

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_PROFILE_BODY, method: 'PATCH', path: USER_PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('USERNAME_ALREADY_TAKEN')
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
