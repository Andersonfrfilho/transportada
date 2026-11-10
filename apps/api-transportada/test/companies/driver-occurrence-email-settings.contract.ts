/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type {
  DriverOccurrenceEmailSettings,
  DriverOccurrenceEmailSettingsPort,
} from '../../src/companies/application/driver-occurrence-email-settings.port.js'
import {
  createGetDriverOccurrenceEmailSettingsUseCase,
  createSaveDriverOccurrenceEmailSettingsUseCase,
} from '../../src/companies/application/driver-occurrence-email-settings.use-case.js'
import { createDriverOccurrenceEmailSettingsRoutes } from '../../src/companies/presentation/driver-occurrence-email-settings.routes.js'
import { parseDriverOccurrenceEmailSettingsBody } from '../../src/companies/presentation/driver-occurrence-email-settings.schema.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_SETTINGS_DRIVER_OCCURRENCE_EMAIL_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'

/**
 * Spec 322: o interruptor da empresa para o e-mail do aviso da ocorrência do motorista. Sem linha vale ligado, o corpo
 * é estrito e a empresa vem só do contexto. Auditoria e concorrência ficam na integração com Postgres.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-11-10T10:00:00.000Z')
const RESOLVED_IP = '10.0.0.9'
const FORGED_IP = '6.6.6.6'

const MANAGER_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

function fakePort(initial: DriverOccurrenceEmailSettings) {
  let stored = initial
  const saves: Record<string, unknown>[] = []
  const port: DriverOccurrenceEmailSettingsPort = {
    find: async () => stored,
    save: async (params) => {
      saves.push(params)
      stored = { enabled: params.enabled, updatedAt: UPDATED_AT }
      return stored
    },
  }
  return { port, saves }
}

function routesFor(port: DriverOccurrenceEmailSettingsPort) {
  const dependencies = { settings: port }
  return createDriverOccurrenceEmailSettingsRoutes({
    get: createGetDriverOccurrenceEmailSettingsUseCase(dependencies),
    resolveClientIp: () => RESOLVED_IP,
    save: createSaveDriverOccurrenceEmailSettingsUseCase(dependencies),
  })
}

function callRoute(params: {
  readonly body?: unknown
  readonly method: 'GET' | 'PUT'
  readonly port: DriverOccurrenceEmailSettingsPort
}): Promise<Response> {
  const route = routesFor(params.port).find((candidate) => candidate.method === params.method)
  if (route === undefined) throw new Error(`missing ${params.method}`)

  return route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT } as never,
    correlationId: 'driver-occurrence-email-contract',
    pathParameters: {},
    request: new Request(`http://api.test${API_COMPANY_SETTINGS_DRIVER_OCCURRENCE_EMAIL_PATH}`, {
      ...(params.body === undefined
        ? {}
        : {
            body: JSON.stringify(params.body),
            headers: { 'content-type': 'application/json', 'x-forwarded-for': FORGED_IP },
          }),
      method: params.method,
    }),
  })
}

async function readData(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json()) as { readonly data: Record<string, unknown> }).data
}

function bodyRequest(value: unknown): Request {
  return new Request(`http://api.test${API_COMPANY_SETTINGS_DRIVER_OCCURRENCE_EMAIL_PATH}`, {
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejection(attempt: () => Promise<unknown>): Promise<ApiError> {
  try {
    await attempt()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected a rejection')
}

describe('driver occurrence email settings: body (spec 322)', () => {
  test('accepts both switch positions', async () => {
    for (const enabled of [true, false]) {
      expect(await parseDriverOccurrenceEmailSettingsBody(bodyRequest({ enabled }))).toEqual({
        enabled,
      })
    }
  })

  test('refuses a non-boolean, null and a missing switch with 400', async () => {
    for (const value of [{ enabled: 'true' }, { enabled: 1 }, { enabled: null }, {}]) {
      const error = await rejection(() =>
        parseDriverOccurrenceEmailSettingsBody(bodyRequest(value)),
      )
      expect(error.status).toBe(400)
    }
  })

  test('refuses any extra key: the company never comes from the body', async () => {
    for (const extra of [{ companyId: OTHER_COMPANY_ID }, { updatedByUserId: USER_ID }]) {
      const error = await rejection(() =>
        parseDriverOccurrenceEmailSettingsBody(bodyRequest({ enabled: true, ...extra })),
      )
      expect(error.status).toBe(400)
    }
  })
})

describe('driver occurrence email settings: routes (spec 322)', () => {
  test('GET without a row answers enabled and no update date', async () => {
    const { port } = fakePort({ enabled: true, updatedAt: null })
    const response = await callRoute({ method: 'GET', port })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toEqual({ enabled: true, updatedAt: null })
  })

  test('PUT hands the port the context company and actor, the resolved IP and the correlation id', async () => {
    const { port, saves } = fakePort({ enabled: true, updatedAt: null })
    await callRoute({ body: { enabled: false }, method: 'PUT', port })

    expect(saves).toEqual([
      {
        companyId: COMPANY_ID,
        correlationId: 'driver-occurrence-email-contract',
        enabled: false,
        ipAddress: RESOLVED_IP,
        userId: USER_ID,
      },
    ])
    expect(JSON.stringify(saves)).not.toContain(FORGED_IP)
  })

  test('PUT with a companyId in the body is a 400 and never reaches the port', async () => {
    const { port, saves } = fakePort({ enabled: true, updatedAt: null })
    const failure = await rejection(() =>
      callRoute({ body: { companyId: OTHER_COMPANY_ID, enabled: false }, method: 'PUT', port }),
    )

    expect(failure.status).toBe(400)
    expect(saves).toEqual([])
  })

  test('the PUT answer is the same body a GET gives afterwards', async () => {
    const { port } = fakePort({ enabled: true, updatedAt: null })
    const written = await readData(
      await callRoute({ body: { enabled: false }, method: 'PUT', port }),
    )
    const read = await readData(await callRoute({ method: 'GET', port }))

    expect(written).toEqual({ enabled: false, updatedAt: UPDATED_AT.toISOString() })
    expect(read).toEqual(written)
  })

  test('the answer is a whitelist: a leaky stored object does not spread', async () => {
    const leaky = {
      companyId: OTHER_COMPANY_ID,
      enabled: true,
      updatedAt: UPDATED_AT,
      updatedByUserId: USER_ID,
    } as unknown as DriverOccurrenceEmailSettings
    const text = await (await callRoute({ method: 'GET', port: fakePort(leaky).port })).text()

    expect(Object.keys(JSON.parse(text).data).sort()).toEqual(['enabled', 'updatedAt'])
    expect(text).not.toContain(OTHER_COMPANY_ID)
    expect(text).not.toContain(USER_ID)
  })

  test('both routes live under settings.manage, company scope, at the agreed path', () => {
    const routes = routesFor(fakePort({ enabled: true, updatedAt: null }).port)

    expect(routes.map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'GET /company-settings/driver-occurrence-email',
      'PUT /company-settings/driver-occurrence-email',
    ])
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })

  test('the routes read the company from the context and the IP from the injected resolver', () => {
    const source = readFileSync(
      new URL(
        '../../src/companies/presentation/driver-occurrence-email-settings.routes.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source.match(/companyId: context\.scope\.companyId/g)?.length).toBe(2)
    expect(source).toContain('resolveClientIp(request)')
    expect(source).not.toMatch(/x-forwarded-for|x-real-ip|cf-connecting-ip/i)
  })
})
