/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createKeycloakAdminClient } from '@adatechnology/keycloak-admin'

import { createFullRepresentationFetch } from '../../src/identity/infrastructure/keycloak-full-representation.fetch.js'

const BASE_URL = 'https://keycloak.test'
const USER_URL = `${BASE_URL}/admin/realms/transportada/users/conta-1`
const CURRENT = {
  email: 'pessoa@empresa.test',
  enabled: true,
  firstName: 'Pessoa',
  id: 'conta-1',
  lastName: 'de Teste',
  username: 'pessoa.teste',
}

type Recorded = { readonly body: unknown; readonly method: string; readonly url: string }

function createKeycloakFake() {
  const calls: Recorded[] = []
  const fetch = async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      method,
      url,
    })
    if (url.endsWith('/protocol/openid-connect/token')) {
      return Response.json({ access_token: 'token', expires_in: 300 })
    }
    if (method === 'GET') return Response.json({ ...CURRENT, attributes: { company_id: ['c1'] } })
    return new Response(null, { status: 204 })
  }
  return { calls, fetch }
}

/**
 * Keycloak 26.5.2, realm de produção, 16/09/2026: `PUT { attributes }` responde 400 "User name is
 * missing", e `PUT { username, attributes }` apaga e-mail e nome. Toda edição de perfil terminava
 * nesse PUT, e trocar nome, e-mail ou login dava 500.
 */
describe('regravação de atributos manda a ficha completa ao Keycloak', () => {
  test('updateAttributes lê a conta e regrava a representação com os atributos novos', async () => {
    const keycloak = createKeycloakFake()
    const client = createKeycloakAdminClient({
      config: {
        baseUrl: BASE_URL,
        clientId: 'api',
        clientSecret: 'segredo',
        realm: 'transportada',
      },
      fetch: createFullRepresentationFetch(keycloak.fetch),
    })

    await client.updateAttributes({ attributes: { tax_id: '00000000000' }, userId: 'conta-1' })

    const put = keycloak.calls.find((call) => call.method === 'PUT')
    expect(put?.url).toBe(USER_URL)
    expect(put?.body).toMatchObject({
      ...CURRENT,
      attributes: { tax_id: ['00000000000'] },
    })
  })

  test('a foto, que também grava só atributos, sai com a ficha completa', async () => {
    const keycloak = createKeycloakFake()
    const client = createKeycloakAdminClient({
      config: {
        baseUrl: BASE_URL,
        clientId: 'api',
        clientSecret: 'segredo',
        realm: 'transportada',
      },
      fetch: createFullRepresentationFetch(keycloak.fetch),
    })

    await client.setProfilePicture({ pictureUrl: 'https://api.test/p.png', userId: 'conta-1' })

    const put = keycloak.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toMatchObject({ email: CURRENT.email, username: CURRENT.username })
  })

  test('troca de nome, e-mail, login e habilitação passam intactas, sem leitura extra', async () => {
    const keycloak = createKeycloakFake()
    const client = createKeycloakAdminClient({
      config: {
        baseUrl: BASE_URL,
        clientId: 'api',
        clientSecret: 'segredo',
        realm: 'transportada',
      },
      fetch: createFullRepresentationFetch(keycloak.fetch),
    })

    await client.updateUser({ user: { firstName: 'Nova' }, userId: 'conta-1' })
    await client.setEnabled({ enabled: true, userId: 'conta-1' })

    const userCalls = keycloak.calls.filter((call) => call.url === USER_URL)
    expect(userCalls.map((call) => call.method)).toEqual(['PUT', 'PUT'])
    expect(userCalls[0]?.body).toEqual({ firstName: 'Nova' })
  })

  test('conta que não existe devolve a resposta da leitura, sem regravar nada', async () => {
    const calls: string[] = []
    const fetch = createFullRepresentationFetch(async (_input, init) => {
      calls.push(init?.method ?? 'GET')
      return new Response(null, { status: 404 })
    })

    const response = await fetch(USER_URL, {
      body: JSON.stringify({ attributes: {} }),
      method: 'PUT',
    })

    expect(response.status).toBe(404)
    expect(calls).toEqual(['GET'])
  })
})
