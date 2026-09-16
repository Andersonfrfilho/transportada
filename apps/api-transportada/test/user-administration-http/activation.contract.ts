/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  jsonRequest,
  TARGET_USER_ID,
  WITHOUT_USERS_MANAGE_PERMISSIONS,
} from '../fixtures/user-administration-http.fixture'

const ACTIVATION_PATH = `${COMPANY_USERS_PATH}/${TARGET_USER_ID}/activation`
const STRONG_PASSWORD = 'senha-de-teste-suficientemente-longa'

describe('rota de ativação manual do usuário', () => {
  test('sem senha, ativa e devolve a ficha', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'POST', path: ACTIVATION_PATH }),
    )

    expect(response.status).toBe(200)
    expect(fixture.activateCalls).toHaveLength(1)
    expect(fixture.activateCalls[0]).toMatchObject({ userId: TARGET_USER_ID })
    expect(fixture.activateCalls[0]).not.toHaveProperty('password')
  })

  test('com senha, leva senha e `temporary` e não ecoa a senha', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { password: STRONG_PASSWORD, temporary: true },
        method: 'POST',
        path: ACTIVATION_PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain(STRONG_PASSWORD)
    expect(fixture.activateCalls[0]).toMatchObject({ password: STRONG_PASSWORD, temporary: true })
  })

  test('senha sem `temporary` é recusada antes do caso de uso', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { password: STRONG_PASSWORD }, method: 'POST', path: ACTIVATION_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.activateCalls).toHaveLength(0)
  })

  test('senha curta é recusada', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { password: 'curta', temporary: true },
        method: 'POST',
        path: ACTIVATION_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.activateCalls).toHaveLength(0)
  })

  test('sem `users.manage` não ativa ninguém', async () => {
    const fixture = await createUserAdministrationHttpFixture({
      permissions: WITHOUT_USERS_MANAGE_PERMISSIONS,
    })

    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'POST', path: ACTIVATION_PATH }),
    )

    expect(response.status).toBe(403)
    expect(fixture.activateCalls).toHaveLength(0)
  })
})
