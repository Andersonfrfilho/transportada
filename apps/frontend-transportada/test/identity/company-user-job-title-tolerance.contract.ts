/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 272 T1.2: o usuário da empresa com `jobTitle` (texto, nulo ou ausente) passa por lista, detalhe e
 * resposta do PATCH. O painel é publicado antes da API mandar o campo.
 */
import { describe, expect, test } from 'bun:test'

import { createCompanyUsersClient } from '../../src/modules/identity/shared/companyUsersClient.service'
import { toCompanyUser } from '../../src/modules/identity/shared/companyUsersResponse.validation'

const API_URL = 'https://api.example.test'
const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93'

const COMPANY_USER_CORE = {
  contact: { channel: 'email', masked: 'a***@example.test' },
  email: 'a***@example.test',
  hasPicture: false,
  id: USER_ID,
  membershipId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e94',
  name: 'Ana Operação',
  phone: '***88',
  roles: ['operator'],
  status: 'active',
  taxId: '***09',
  username: 'ana.operacao',
} as const

const JOB_TITLE_VARIANTS: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
  ['com cargo em texto', { jobTitle: 'Coordenadora de Expedição' }],
  ['com cargo nulo', { jobTitle: null }],
  ['sem a chave (API anterior)', {}],
]

function clientFor(response: unknown) {
  return createCompanyUsersClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(Response.json(response)),
    getAccessToken: () => Promise.resolve('synthetic-access-token'),
    newIdempotencyKey: () => 'synthetic-idempotency-key',
  })
}

describe('spec 272 T1.2: tolerância ao cargo do usuário da empresa (jobTitle)', () => {
  test.each(JOB_TITLE_VARIANTS)('a lista aceita usuário %s', async (_label, extra) => {
    const client = clientFor({
      data: [{ ...COMPANY_USER_CORE, ...extra }],
      page: { nextCursor: null },
    })

    const page = await client.listUsers({ cursor: null, limit: 20 })

    expect(page.users.map((user) => user.id)).toEqual([USER_ID])
    expect(page.users[0]?.name).toBe('Ana Operação')
  })

  test.each(JOB_TITLE_VARIANTS)('o detalhe aceita usuário %s', (_label, extra) => {
    const user = toCompanyUser({ ...COMPANY_USER_CORE, ...extra })

    expect(user.id).toBe(USER_ID)
    expect(user.username).toBe('ana.operacao')
  })

  test.each(JOB_TITLE_VARIANTS)('a resposta do PATCH aceita usuário %s', async (_label, extra) => {
    const client = clientFor({ data: { ...COMPANY_USER_CORE, ...extra } })

    const user = await client.updateProfile({ name: 'Ana Operação', userId: USER_ID })

    expect(user.id).toBe(USER_ID)
    expect(user.name).toBe('Ana Operação')
  })
})
