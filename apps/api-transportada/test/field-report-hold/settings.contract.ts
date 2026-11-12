/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320 D8: o interruptor por empresa. Sem linha é desligado; ligar e desligar é `settings.manage`.
 */
import { describe, expect, test } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createFieldReportHoldRoutes } from '../../src/trips/presentation/field-report-hold.routes.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const SCOPE: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

const CONTEXT: AuthenticatedContext<CompanyContext> = {
  identity: {} as AuthenticatedIdentity,
  scope: SCOPE,
}

function buildRoutes() {
  const saves: Record<string, unknown>[] = []
  let enabled = false
  const routes = createFieldReportHoldRoutes({
    register: () => Promise.reject(new Error('fora do escopo')),
    repository: {
      decide: () => Promise.resolve(false),
      findById: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
    },
    settings: {
      readSettings: () => Promise.resolve({ enabled, updatedAt: null }),
      saveSettings: (input) => {
        saves.push({ ...input })
        enabled = input.enabled
        return Promise.resolve({ enabled, updatedAt: new Date('2026-11-10T20:00:00.000Z') })
      },
    },
  })
  const find = (method: string) =>
    routes.find(
      (route) =>
        route.pathname === '/company-settings/field-report-hold' && route.method === method,
    )

  return { find, saves }
}

function put(body: unknown): Request {
  return new Request('http://api/company-settings/field-report-hold', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('interruptor da trava por empresa (spec 320 D8)', () => {
  test('as duas rotas pedem settings.manage, e a gravação tem limite de taxa', () => {
    const { find } = buildRoutes()
    expect(find('GET')?.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    expect(find('PUT')?.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    expect(find('PUT')?.rateLimit).toMatchObject({
      scope: 'field-report-hold-settings',
      store: 'postgres',
    })
  })

  test('sem linha a leitura responde desligado, não 404', async () => {
    const { find } = buildRoutes()
    const response = await find('GET')!.execute({
      context: CONTEXT,
      correlationId: 'c',
      pathParameters: {},
      request: new Request('http://api/company-settings/field-report-hold'),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { enabled: false, updatedAt: null } })
  })

  test('ligar grava para a empresa e o usuário do contexto, nunca do corpo', async () => {
    const { find, saves } = buildRoutes()
    const response = await find('PUT')!.execute({
      context: CONTEXT,
      correlationId: 'c',
      pathParameters: {},
      request: put({ enabled: true }),
    })
    expect(response.status).toBe(200)
    expect(saves).toEqual([{ companyId: COMPANY_ID, enabled: true, userId: USER_ID }])
  })

  test('corpo com campo a mais ou tipo errado é recusado e não grava', async () => {
    const { find, saves } = buildRoutes()
    for (const body of [{ companyId: 'x', enabled: true }, { enabled: 'sim' }, {}]) {
      await expect(
        find('PUT')!.execute({
          context: CONTEXT,
          correlationId: 'c',
          pathParameters: {},
          request: put(body),
        }),
      ).rejects.toBeDefined()
    }
    expect(saves).toEqual([])
  })
})
