/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  COMPANY_ROLES,
  COMPANY_USER_ERROR,
} from '../../src/modules/identity/shared/companyUsers.constant'
import {
  createCompanyUsersClient,
  type CompanyUsersClient,
} from '../../src/modules/identity/shared/companyUsersClient.service'
import {
  toCompanyUser,
  toCompanyUserPage,
} from '../../src/modules/identity/shared/companyUsersResponse.validation'
import {
  buildRoleChoices,
  createCompanyUsersViewModel,
} from '../../src/modules/identity/shared/companyUsersViewModel.service'
import { createCompanyUsersController } from '../../src/modules/identity/hooks/useCompanyUsers.hook'

const API_URL = 'https://transportada.test'
const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93'

const COMPANY_USER_PAYLOAD = {
  contact: { channel: 'email', masked: 'a***@example.test' },
  id: USER_ID,
  membershipId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e94',
  name: 'Ana Fiscal',
  roles: ['operator'],
  status: 'active',
  username: 'ana.fiscal',
} as const

type Recorded = Readonly<{ body: string; request: Request }>

function createRecordingClient(
  respond: (request: Request) => Response,
): Readonly<{ client: CompanyUsersClient; calls: Recorded[] }> {
  const calls: Recorded[] = []
  const client = createCompanyUsersClient({
    apiUrl: API_URL,
    async fetch(input) {
      const request = input as Request
      calls.push({ body: await request.clone().text(), request })
      return respond(request)
    },
    getAccessToken: () => Promise.resolve('synthetic-access-token'),
    newIdempotencyKey: () => 'synthetic-idempotency-key',
  })
  return { calls, client }
}

function respondWithUser(): Response {
  return Response.json({ data: COMPANY_USER_PAYLOAD }, { status: 200 })
}

describe('company users client contract', () => {
  test('lists a page carrying the cursor and the limit in the query string', async () => {
    const { calls, client } = createRecordingClient(() =>
      Response.json(
        { data: [COMPANY_USER_PAYLOAD], page: { nextCursor: 'next-cursor' } },
        { status: 200 },
      ),
    )

    const page = await client.listUsers({ cursor: 'previous-cursor', limit: 50 })

    const call = calls[0]?.request
    expect(call?.method).toBe('GET')
    expect(call?.url).toBe(`${API_URL}/company-users?cursor=previous-cursor&limit=50`)
    expect(call?.headers.get('authorization')).toBe('Bearer synthetic-access-token')
    expect(call?.headers.get('idempotency-key')).toBeNull()
    expect(page.nextCursor).toBe('next-cursor')
    expect(page.users).toEqual([COMPANY_USER_PAYLOAD])
  })

  test('omits the cursor on the first page', async () => {
    const { calls, client } = createRecordingClient(() =>
      Response.json({ data: [], page: { nextCursor: null } }, { status: 200 }),
    )

    await client.listUsers({ cursor: null, limit: 50 })

    expect(calls[0]?.request.url).toBe(`${API_URL}/company-users?limit=50`)
  })

  test('sends the invitation with an idempotency key and only the four accepted fields', async () => {
    const { calls, client } = createRecordingClient(() =>
      Response.json({ data: COMPANY_USER_PAYLOAD }, { status: 201 }),
    )

    await client.inviteUser({
      channel: 'email',
      contact: 'ana@example.test',
      name: 'Ana Fiscal',
      roles: ['operator'],
    })

    const call = calls[0]
    expect(call?.request.method).toBe('POST')
    expect(call?.request.url).toBe(`${API_URL}/company-users`)
    expect(call?.request.headers.get('idempotency-key')).toBe('synthetic-idempotency-key')
    expect(JSON.parse(call?.body ?? '')).toEqual({
      channel: 'email',
      contact: 'ana@example.test',
      name: 'Ana Fiscal',
      roles: ['operator'],
    })
  })

  test('resends the invitation without reading a body and keeps the idempotency key', async () => {
    const { calls, client } = createRecordingClient(() =>
      Response.json(
        { data: { expiresAt: '2026-08-22T12:00:00.000Z', userId: USER_ID } },
        {
          status: 202,
        },
      ),
    )

    const result = await client.resendInvitation({ userId: USER_ID })

    expect(calls[0]?.request.method).toBe('POST')
    expect(calls[0]?.request.url).toBe(`${API_URL}/company-users/${USER_ID}/invitation`)
    expect(calls[0]?.body).toBe('')
    expect(calls[0]?.request.headers.get('idempotency-key')).toBe('synthetic-idempotency-key')
    expect(result).toEqual({ expiresAt: '2026-08-22T12:00:00.000Z', userId: USER_ID })
  })

  test.each([
    ['changeStatus', 'PATCH', `/company-users/${USER_ID}/status`, { status: 'suspended' }],
    ['replaceRoles', 'PUT', `/company-users/${USER_ID}/roles`, { roles: ['viewer'] }],
  ])('%s reaches %s %s with the payload the route parses', async (method, verb, path, body) => {
    const { calls, client } = createRecordingClient(respondWithUser)

    if (method === 'changeStatus') {
      await client.changeStatus({ status: 'suspended', userId: USER_ID })
    } else {
      await client.replaceRoles({ roles: ['viewer'], userId: USER_ID })
    }

    expect(calls[0]?.request.method).toBe(verb)
    expect(calls[0]?.request.url).toBe(`${API_URL}${path}`)
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual(body)
  })

  /** Chave ausente é o que diz "não mexa neste dado" — mandar o objeto inteiro apagaria o resto. */
  test('patches the profile carrying only the fields that changed', async () => {
    const { calls, client } = createRecordingClient(respondWithUser)

    await client.updateProfile({ name: 'Ana F. Silva', userId: USER_ID })

    expect(calls[0]?.request.method).toBe('PATCH')
    expect(calls[0]?.request.url).toBe(`${API_URL}/company-users/${USER_ID}`)
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ name: 'Ana F. Silva' })
  })

  /** O 204 vem sem corpo: tentar lê-lo como JSON transformaria a remoção bem-sucedida em erro. */
  test('reads the removal 204 with an empty body as success', async () => {
    const { calls, client } = createRecordingClient(() => new Response(null, { status: 204 }))

    await client.removeUser({ userId: USER_ID })

    expect(calls[0]?.request.method).toBe('DELETE')
    expect(calls[0]?.request.url).toBe(`${API_URL}/company-users/${USER_ID}`)
  })

  test.each([
    ['SELF_MEMBERSHIP_REMOVAL', 409],
    ['COMPANY_USER_CONTACT_TAKEN', 409],
    ['COMPANY_USER_NOT_FOUND', 404],
  ])('surfaces the %s the API answers so the dialog can name the field', async (code, status) => {
    const { client } = createRecordingClient(() => Response.json({ error: { code } }, { status }))

    let caught: unknown
    try {
      await client.removeUser({ userId: USER_ID })
    } catch (error) {
      caught = error
    }

    expect((caught as Error).message).toBe(code)
  })

  test('collapses a refusal without a readable body into the generic request failure', async () => {
    const { client } = createRecordingClient(() => new Response(null, { status: 502 }))

    let caught: unknown
    try {
      await client.listUsers({ cursor: null, limit: 50 })
    } catch (error) {
      caught = error
    }

    expect((caught as Error).message).toBe(COMPANY_USER_ERROR.REQUEST_FAILED)
  })

  test('reports the network failure as a request failure, never as a broken response', async () => {
    const client = createCompanyUsersClient({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new Error('connection refused')),
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
      newIdempotencyKey: () => 'synthetic-idempotency-key',
    })

    let caught: unknown
    try {
      await client.listUsers({ cursor: null, limit: 50 })
    } catch (error) {
      caught = error
    }

    expect((caught as Error).message).toBe(COMPANY_USER_ERROR.REQUEST_FAILED)
  })
})

/**
 * Guarda tolerante de propósito: campo novo da API não pode derrubar a tela inteira enquanto todas
 * as respostas continuam 200 — só campo obrigatório ausente é resposta que não dá para desenhar.
 */
describe('company users response guard contract', () => {
  test('ignores a field the API added and keeps the user readable', () => {
    expect(toCompanyUser({ ...COMPANY_USER_PAYLOAD, lastSignedInAt: '2026-08-20' })).toEqual(
      COMPANY_USER_PAYLOAD,
    )
  })

  test('keeps the pending invitation when it comes and drops it when it does not', () => {
    const invited = toCompanyUser({
      ...COMPANY_USER_PAYLOAD,
      invitation: { expiresAt: '2026-08-22T12:00:00.000Z', status: 'pending' },
    })

    expect(invited.invitation).toEqual({
      expiresAt: '2026-08-22T12:00:00.000Z',
      status: 'pending',
    })
    expect(toCompanyUser(COMPANY_USER_PAYLOAD).invitation).toBeUndefined()
  })

  test('accepts a role, a status and a channel the client catalog does not know', () => {
    const user = toCompanyUser({
      ...COMPANY_USER_PAYLOAD,
      contact: { channel: 'telegram', masked: '***' },
      roles: ['auditor'],
      status: 'archived',
    })

    expect(user.roles).toEqual(['auditor'])
    expect(user.status).toBe('archived')
    expect(user.contact.channel).toBe('telegram')
  })

  test.each([
    ['a missing membership id', { ...COMPANY_USER_PAYLOAD, membershipId: undefined }],
    ['a contact that is not an object', { ...COMPANY_USER_PAYLOAD, contact: 'ana@example.test' }],
    ['roles that are not strings', { ...COMPANY_USER_PAYLOAD, roles: [1] }],
  ])('refuses %s', (_name, payload) => {
    expect(() => toCompanyUser(payload)).toThrow(COMPANY_USER_ERROR.RESPONSE_INVALID)
  })

  test('reads a page without the cursor block as the last page', () => {
    expect(toCompanyUserPage({ data: [] }).nextCursor).toBeNull()
  })
})

describe('company users controller contract', () => {
  const client = {
    changeStatus: mock(() => Promise.resolve(COMPANY_USER_PAYLOAD)),
    inviteUser: mock(() => Promise.resolve(COMPANY_USER_PAYLOAD)),
    listUsers: mock(() => Promise.resolve({ nextCursor: null, users: [] })),
    removeUser: mock(() => Promise.resolve()),
    replaceRoles: mock(() => Promise.resolve(COMPANY_USER_PAYLOAD)),
    resendInvitation: mock(() => Promise.resolve({ expiresAt: '', userId: USER_ID })),
    updateProfile: mock(() => Promise.resolve(COMPANY_USER_PAYLOAD)),
  } as unknown as CompanyUsersClient

  /** A rota já recusa sem a permissão; barrar aqui evita o 403 que a tela não teria como explicar. */
  test.each([
    ['changeStatus', () => ({ status: 'suspended' as const, userId: USER_ID })],
    [
      'inviteUser',
      () => ({ channel: 'email' as const, contact: 'a@b.test', name: 'Ana', roles: ['operator'] }),
    ],
    ['removeUser', () => ({ userId: USER_ID })],
    ['replaceRoles', () => ({ roles: ['viewer'], userId: USER_ID })],
    ['resendInvitation', () => ({ userId: USER_ID })],
    ['updateProfile', () => ({ name: 'Ana', userId: USER_ID })],
  ])('refuses %s without users.manage and never reaches the API', async (method, buildInput) => {
    const controller = createCompanyUsersController({ client, permissions: ['fleet.read'] })

    let caught: unknown
    try {
      await (controller[method as keyof typeof controller] as (input: unknown) => Promise<unknown>)(
        buildInput(),
      )
    } catch (error) {
      caught = error
    }

    expect((caught as Error).message).toBe(COMPANY_USER_ERROR.FORBIDDEN)
    expect(controller.canManageUsers).toBeFalse()
  })

  test('lets every method through once users.manage is granted', async () => {
    const controller = createCompanyUsersController({
      client,
      permissions: ['fleet.read', 'users.manage'],
    })

    expect(controller.canManageUsers).toBeTrue()
    expect(await controller.removeUser({ userId: USER_ID })).toBeUndefined()
  })
})

describe('company users view model contract', () => {
  test.each([
    ['forbidden' as const, { permissions: [], queryStatus: 'success' as const }],
    ['loading' as const, { permissions: ['users.manage'], queryStatus: 'loading' as const }],
    ['error' as const, { permissions: ['users.manage'], queryStatus: 'error' as const }],
    ['empty' as const, { permissions: ['users.manage'], queryStatus: 'success' as const }],
  ])('answers %s', (status, input) => {
    expect(createCompanyUsersViewModel(input).status).toBe(status)
  })

  test('answers ready and publishes the cursor once the page carries users', () => {
    const viewModel = createCompanyUsersViewModel({
      page: { nextCursor: 'next-cursor', users: [COMPANY_USER_PAYLOAD] },
      permissions: ['users.manage'],
      queryStatus: 'success',
    })

    expect(viewModel.status).toBe('ready')
    expect(viewModel.nextCursor).toBe('next-cursor')
    expect(viewModel.users).toHaveLength(1)
  })

  /** Papel já concedido entra na lista mesmo desconhecido: salvar apagaria o que não estivesse aqui. */
  test('keeps a granted role the client catalog does not know', () => {
    expect(buildRoleChoices(['auditor', 'operator'])).toEqual([...COMPANY_ROLES, 'auditor'])
  })

  test('offers the plain catalog when nothing unknown is granted', () => {
    expect(buildRoleChoices(['operator'])).toEqual([...COMPANY_ROLES])
  })
})
