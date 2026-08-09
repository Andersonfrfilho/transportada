/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * R6 da feature 026 na fronteira real: o que os use-cases entregam ao gateway tem de chegar ao
 * cliente do Admin API. Dublê no lugar do cliente — o Keycloak não sobe aqui.
 */
import { describe, expect, test } from 'bun:test'

import type { KeycloakAdminClient } from '@adatechnology/keycloak-admin'

import { createIdentityAccessGateway } from '../../src/identity/infrastructure/keycloak-admin.gateway.js'

const CONFIG = {
  clientId: 'transportada-admin',
  clientSecret: 'segredo-de-teste-nao-real',
  issuer: 'https://keycloak.test/realms/transportada',
} as const

const SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

type Call = { readonly name: string; readonly params: Record<string, unknown> }

function createClientFake() {
  const calls: Call[] = []
  const record = (name: string, params: unknown): void => {
    calls.push({ name, params: params as Record<string, unknown> })
  }

  const client: KeycloakAdminClient = {
    async createUser(params) {
      record('createUser', params)
      return { id: SUBJECT }
    },
    async deleteUser(params) {
      record('deleteUser', params)
    },
    async findUserByEmail(params) {
      record('findUserByEmail', params)
      return { id: SUBJECT, username: 'pessoa' }
    },
    async setEnabled(params) {
      record('setEnabled', params)
    },
    async setPassword(params) {
      record('setPassword', params)
    },
    async setTemporaryPassword(params) {
      record('setTemporaryPassword', params)
    },
    async updateAttributes(params) {
      record('updateAttributes', params)
    },
    async updateUser(params) {
      record('updateUser', params)
    },
  }

  return { calls, gateway: createIdentityAccessGateway(CONFIG, { createClient: () => client }) }
}

describe('gateway do Admin API — criação de usuário', () => {
  test('leva nome e atributos ao cliente, não só e-mail e username', async () => {
    const { calls, gateway } = createClientFake()

    const result = await gateway.createUser({
      attributes: { company_id: COMPANY_ID },
      email: 'pessoa@empresa.test',
      enabled: false,
      firstName: 'Maria',
      lastName: 'Aparecida Souza',
      username: 'maria',
    })

    expect(result).toEqual({ subject: SUBJECT })
    expect(calls[0]).toEqual({
      name: 'createUser',
      params: {
        attributes: { company_id: COMPANY_ID },
        email: 'pessoa@empresa.test',
        emailVerified: false,
        enabled: false,
        firstName: 'Maria',
        lastName: 'Aparecida Souza',
        username: 'maria',
      },
    })
  })

  test('omite o que não foi informado em vez de mandar indefinido ao Admin API', async () => {
    const { calls, gateway } = createClientFake()

    await gateway.createUser({
      email: 'pessoa@empresa.test',
      enabled: true,
      username: 'pessoa',
    })

    expect(Object.keys(calls[0]?.params ?? {}).sort()).toEqual([
      'email',
      'emailVerified',
      'enabled',
      'username',
    ])
  })
})

describe('gateway do Admin API — edição, remoção e senha temporária', () => {
  test('repassa a edição de perfil e a de atributos como operações distintas', async () => {
    const { calls, gateway } = createClientFake()

    await gateway.updateUser({ user: { firstName: 'João', username: 'joao' }, userId: SUBJECT })
    await gateway.updateAttributes({ attributes: { company_id: COMPANY_ID }, userId: SUBJECT })

    expect(calls).toEqual([
      {
        name: 'updateUser',
        params: { user: { firstName: 'João', username: 'joao' }, userId: SUBJECT },
      },
      {
        name: 'updateAttributes',
        params: { attributes: { company_id: COMPANY_ID }, userId: SUBJECT },
      },
    ])
  })

  test('remove o usuário e define senha temporária pelo subject', async () => {
    const { calls, gateway } = createClientFake()

    await gateway.setTemporaryPassword({ password: 'senha-de-teste-nao-real', userId: SUBJECT })
    await gateway.deleteUser({ userId: SUBJECT })

    expect(calls.map((call) => call.name)).toEqual(['setTemporaryPassword', 'deleteUser'])
    expect(calls[0]?.params).toEqual({ password: 'senha-de-teste-nao-real', userId: SUBJECT })
    expect(calls[1]?.params).toEqual({ userId: SUBJECT })
  })

  test('a busca por e-mail devolve o subject, que é como o Admin API endereça', async () => {
    const { calls, gateway } = createClientFake()

    const found = await gateway.findUserByEmail({ email: 'pessoa@empresa.test' })

    expect(found).toEqual({ subject: SUBJECT, username: 'pessoa' })
    expect(calls[0]).toEqual({
      name: 'findUserByEmail',
      params: { email: 'pessoa@empresa.test' },
    })
  })
})
