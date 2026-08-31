/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_USER_PASSWORD_MIN_LENGTH } from '../../src/identity/domain/company-user-password.constant.js'
import {
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  jsonRequest,
  TARGET_USER_ID,
  WITHOUT_USERS_MANAGE_PERMISSIONS,
} from '../fixtures/user-administration-http.fixture'

const PASSWORD_PATH = `${COMPANY_USERS_PATH}/${TARGET_USER_ID}/password`
const STRONG_PASSWORD = 'senha-de-teste-suficientemente-longa'

describe('rota de senha do usuário da empresa', () => {
  test('define a senha e responde 204 sem devolver eco do corpo', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { password: STRONG_PASSWORD, temporary: false },
        method: 'PUT',
        path: PASSWORD_PATH,
      }),
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.setPasswordCalls).toHaveLength(1)
    expect(fixture.setPasswordCalls[0]).toMatchObject({
      password: STRONG_PASSWORD,
      temporary: false,
      userId: TARGET_USER_ID,
    })
  })

  test('leva o `temporary` como veio: é ele que obriga a troca no primeiro login', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    await fixture.handle(
      jsonRequest({
        body: { password: STRONG_PASSWORD, temporary: true },
        method: 'PUT',
        path: PASSWORD_PATH,
      }),
    )

    expect(fixture.setPasswordCalls[0]).toMatchObject({ temporary: true })
  })

  /** Senha curta escolhida por terceiro circula fora do sistema antes de chegar a quem a usa. */
  test('recusa senha abaixo do piso sem tocar no provedor', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { password: 'a'.repeat(COMPANY_USER_PASSWORD_MIN_LENGTH - 1), temporary: false },
        method: 'PUT',
        path: PASSWORD_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.setPasswordCalls).toHaveLength(0)
  })

  test('recusa corpo sem `temporary`: o padrão escondido decidiria pelo operador', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { password: STRONG_PASSWORD }, method: 'PUT', path: PASSWORD_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.setPasswordCalls).toHaveLength(0)
  })

  test('sem `users.manage` a rota não alcança o provedor', async () => {
    const fixture = await createUserAdministrationHttpFixture({
      permissions: WITHOUT_USERS_MANAGE_PERMISSIONS,
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { password: STRONG_PASSWORD, temporary: false },
        method: 'PUT',
        path: PASSWORD_PATH,
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.setPasswordCalls).toHaveLength(0)
  })
})
