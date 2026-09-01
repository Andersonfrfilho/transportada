/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { ContractorPortalBinding } from '../../src/contractor-portal/application/contractor-portal-binding.port.js'
import { createContractorPortalBindingRoutes } from '../../src/contractor-portal/presentation/contractor-portal-binding.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000801'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000802'

const BINDING: ContractorPortalBinding = {
  contractorId: CONTRACTOR_ID,
  email: 'contas@spani.test',
  id: '00000000-0000-4000-8000-000000000803',
  membershipId: MEMBERSHIP_ID,
  name: 'Maria do contratante',
  userId: '00000000-0000-4000-8000-000000000804',
}

/** Conceder acesso a alguém de fora é `users.manage` — a mesma permissão de convidar usuário. */
const MANAGE_PERMISSIONS: CompanyContext['permissions'] = new Set(['users.manage'] as const)
const MANAGE_CONTEXT: CompanyContext = { ...COMPANY_CONTEXT, permissions: MANAGE_PERMISSIONS }

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: Record<string, unknown[]> = { bind: [], list: [], unbind: [] }

  const record = <TResult>(name: string, result: TResult) => ({
    async execute(input: Record<string, unknown>) {
      calls[name]?.push(structuredClone(input))
      return result
    },
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions ?? MANAGE_PERMISSIONS),
      routes: createContractorPortalBindingRoutes({
        bindPortalUser: record('bind', BINDING),
        listPortalUsers: record('list', [BINDING]),
        unbindPortalUser: record('unbind', undefined),
      }),
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('as rotas do vínculo do contratante (spec 063 T004)', () => {
  test('amarra a conta ao contratante e devolve o par membership+usuário', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { membershipId: MEMBERSHIP_ID },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/portal-users`,
      }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toEqual({
      contractorId: CONTRACTOR_ID,
      email: 'contas@spani.test',
      id: BINDING.id,
      membershipId: MEMBERSHIP_ID,
      name: 'Maria do contratante',
      userId: BINDING.userId,
    })
    expect(fixture.calls.bind).toEqual([
      { context: MANAGE_CONTEXT, contractorId: CONTRACTOR_ID, membershipId: MEMBERSHIP_ID },
    ])
  })

  test('lista e desamarra pela membership', async () => {
    const fixture = createFixture()

    const list = await fixture.handle(
      jsonRequest({ method: 'GET', path: `/contractors/${CONTRACTOR_ID}/portal-users` }),
    )
    expect(list.status).toBe(200)

    const removed = await fixture.handle(
      jsonRequest({
        method: 'DELETE',
        path: `/contractors/${CONTRACTOR_ID}/portal-users/${MEMBERSHIP_ID}`,
      }),
    )
    expect(removed.status).toBe(204)
    expect(fixture.calls.unbind).toEqual([
      { context: MANAGE_CONTEXT, contractorId: CONTRACTOR_ID, membershipId: MEMBERSHIP_ID },
    ])
  })

  /**
   * Conceder acesso a alguém de fora é `users.manage`, não `settings.manage`: quem administra o
   * cadastro do contratante decide para quem se cobra, e isso não é a mesma decisão que decidir
   * quem enxerga a operação.
   */
  test('exige users.manage, e settings.manage não basta', async () => {
    const fixture = createFixture(new Set(['settings.manage'] as const))

    const response = await fixture.handle(
      jsonRequest({
        body: { membershipId: MEMBERSHIP_ID },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/portal-users`,
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.calls.bind).toEqual([])
  })

  /** O corpo é `strict`: campo a mais é recusa, não campo ignorado em silêncio. */
  test('recusa corpo com campo desconhecido e membership que não é UUID', async () => {
    const fixture = createFixture()

    const extra = await fixture.handle(
      jsonRequest({
        body: { contractorId: CONTRACTOR_ID, membershipId: MEMBERSHIP_ID },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/portal-users`,
      }),
    )
    expect(extra.status).toBe(400)

    const invalid = await fixture.handle(
      jsonRequest({
        body: { membershipId: 'maria' },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/portal-users`,
      }),
    )
    expect(invalid.status).toBe(400)
    expect((await responseApiError(invalid)).code).toBe('INVALID_REQUEST')
    expect(fixture.calls.bind).toEqual([])
  })
})
