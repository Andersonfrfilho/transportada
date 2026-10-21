/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  jsonRequest,
  responseApiError,
  TARGET_USER_ID,
  WITHOUT_USERS_MANAGE_PERMISSIONS,
} from '../fixtures/user-administration-http.fixture'

const USER_PATH = `${COMPANY_USERS_PATH}/${TARGET_USER_ID}`

async function patch(
  body: unknown,
  options: Parameters<typeof createUserAdministrationHttpFixture>[0] = {},
) {
  const fixture = await createUserAdministrationHttpFixture(options)
  const response = await fixture.handle(jsonRequest({ body, method: 'PATCH', path: USER_PATH }))
  return { fixture, response }
}

describe('rota de edição de usuário — cargo (jobTitle)', () => {
  test('aceita só o cargo e o entrega ao caso de uso, sem mais nada', async () => {
    const { fixture, response } = await patch({ jobTitle: 'Gerente Comercial' })

    expect(response.status).toBe(200)
    expect(Object.keys(fixture.updateProfileCalls[0] ?? {}).sort()).toEqual([
      'context',
      'jobTitle',
      'userId',
    ])
    expect(fixture.updateProfileCalls[0]).toMatchObject({ jobTitle: 'Gerente Comercial' })
  })

  test('cargo ausente não vira chave no caso de uso (não altera)', async () => {
    const { fixture, response } = await patch({ username: 'pessoa.editada' })

    expect(response.status).toBe(200)
    expect(fixture.updateProfileCalls[0]).not.toHaveProperty('jobTitle')
  })

  test('null limpa', async () => {
    const { fixture, response } = await patch({ jobTitle: null })

    expect(response.status).toBe(200)
    expect(fixture.updateProfileCalls[0]).toMatchObject({ jobTitle: null })
  })

  test('string vazia limpa (chega como null)', async () => {
    const { fixture, response } = await patch({ jobTitle: '' })

    expect(response.status).toBe(200)
    expect(fixture.updateProfileCalls[0]).toMatchObject({ jobTitle: null })
  })

  test('quebra de linha e controle chegam saneados', async () => {
    const { fixture, response } = await patch({ jobTitle: '  Gerente\r\nComercial\u0007  ' })

    expect(response.status).toBe(200)
    expect(fixture.updateProfileCalls[0]).toMatchObject({ jobTitle: 'Gerente Comercial' })
  })

  test('80 caracteres passa e 81 é 400 sem chamar o caso de uso', async () => {
    const accepted = await patch({ jobTitle: 'a'.repeat(80) })
    expect(accepted.response.status).toBe(200)

    const refused = await patch({ jobTitle: 'a'.repeat(81) })
    expect(refused.response.status).toBe(400)
    expect(refused.fixture.updateProfileCalls).toEqual([])
  })

  test('jobTitle que não é texto nem null é 400', async () => {
    const { fixture, response } = await patch({ jobTitle: 42 })

    expect(response.status).toBe(400)
    expect(fixture.updateProfileCalls).toEqual([])
  })

  test('o cargo sozinho conta como "ao menos um campo"; só `{}` continua 400', async () => {
    expect((await patch({ jobTitle: null })).response.status).toBe(200)
    expect((await patch({})).response.status).toBe(400)
  })

  test('sem `users.manage` é 403 e nada é gravado', async () => {
    const { fixture, response } = await patch(
      { jobTitle: 'Gerente' },
      { permissions: WITHOUT_USERS_MANAGE_PERMISSIONS },
    )

    expect(response.status).toBe(403)
    expect(fixture.updateProfileCalls).toEqual([])
  })

  test('usuário de outra empresa é 404', async () => {
    const { fixture, response } = await patch({ jobTitle: 'Gerente' }, { refusal: 'cross-tenant' })

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBeDefined()
    expect(fixture.updateProfileCalls).toHaveLength(1)
  })

  test('a empresa não vem do corpo: companyId no payload é 400', async () => {
    const { fixture, response } = await patch({
      companyId: '00000000-0000-4000-8000-0000000009ff',
      jobTitle: 'Gerente',
    })

    expect(response.status).toBe(400)
    expect(fixture.updateProfileCalls).toEqual([])
  })
})
