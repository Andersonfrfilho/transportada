/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type {
  LocationRetentionImpactEntry,
  LocationRetentionSettings,
  LocationRetentionSettingsPort,
} from '../../src/companies/application/location-retention-settings.port.js'
import {
  createClearLocationRetentionSettingsUseCase,
  createGetLocationRetentionSettingsUseCase,
  createReadLocationRetentionImpactUseCase,
  createSaveLocationRetentionSettingsUseCase,
} from '../../src/companies/application/location-retention-settings.use-case.js'
import {
  LOCATION_RETENTION_IMPACT_CAP,
  LOCATION_RETENTION_IMPACT_KIND,
} from '../../src/companies/domain/location-retention.constant.js'
import { summarizeImpactCount } from '../../src/companies/domain/location-retention-impact.policy.js'
import { createLocationRetentionSettingsRoutes } from '../../src/companies/presentation/location-retention-settings.routes.js'
import {
  parseLocationRetentionImpactQuery,
  parseLocationRetentionSettingsBody,
} from '../../src/companies/presentation/location-retention-settings.schema.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  API_COMPANY_SETTINGS_LOCATION_RETENTION_IMPACT_PATH,
  API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH,
} from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'

/**
 * Spec 239 T1.3 (RF1-RF4, CA1-CA5): a configuração do expurgo da posição, por empresa. Sem linha é
 * resposta válida (desligado, 90 dias), nunca 404; nada que a resposta devolve identifica um evento,
 * uma pessoa ou um ponto.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-10-03T12:00:00.000Z')
const EFFECTIVE_AT = new Date('2026-10-04T12:00:00.000Z')
const UPDATED_AT = new Date('2026-10-03T11:00:00.000Z')
const RESOLVED_IP = '10.0.0.9'
const FORGED_IP = '6.6.6.6'
const EVENT_ID = '99999999-9999-4999-8999-999999999999'

const MANAGER_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

const DEFAULT_VIEW = {
  origin: 'default',
  purgeEffectiveAt: null,
  purgeEnabled: false,
  retentionDays: 90,
  updatedAt: null,
}

const STORED: LocationRetentionSettings = {
  purgeEffectiveAt: EFFECTIVE_AT,
  purgeEnabled: true,
  retentionDays: 30,
  updatedAt: UPDATED_AT,
}

/** Cada campo extra é uma isca: se a rota espalhar o objeto do repositório, a isca vaza. */
const LEAKY_STORED = {
  ...STORED,
  accuracyMeters: 12.5,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  eventId: EVENT_ID,
  latitude: -23.55,
  longitude: -46.63,
  recordedAt: new Date('2026-02-02T00:00:00.000Z'),
  updatedByUserId: USER_ID,
} as unknown as LocationRetentionSettings

const IMPACT: readonly LocationRetentionImpactEntry[] = [
  { capped: false, count: 3, kind: LOCATION_RETENTION_IMPACT_KIND.stopEvent },
  { capped: true, count: LOCATION_RETENTION_IMPACT_CAP, kind: LOCATION_RETENTION_IMPACT_KIND.deliveryProof },
  { capped: false, count: 0, kind: LOCATION_RETENTION_IMPACT_KIND.statusEvent },
  { capped: false, count: 5, kind: LOCATION_RETENTION_IMPACT_KIND.stopOccurrence },
  { capped: false, count: 1, kind: LOCATION_RETENTION_IMPACT_KIND.documentOccurrence },
]

const LEAKY_IMPACT = IMPACT.map((entry) => ({
  ...entry,
  eventId: EVENT_ID,
  latitude: -23.55,
  recordedAt: '2026-02-02T00:00:00.000Z',
})) as unknown as readonly LocationRetentionImpactEntry[]

const LEAK_TOKENS = [
  'latitude',
  'longitude',
  'accuracy',
  'eventId',
  'recordedAt',
  'createdAt',
  'capturedAt',
  'updatedBy',
  EVENT_ID,
  USER_ID,
  '-23.55',
] as const

type PortCall = { readonly name: string; readonly input: Record<string, unknown> }

function fakePort(initial: LocationRetentionSettings | null, impact = IMPACT) {
  let stored = initial
  const calls: PortCall[] = []
  const port: LocationRetentionSettingsPort = {
    clear: async (input) => {
      calls.push({ input, name: 'clear' })
      stored = null
    },
    countImpact: async (input) => {
      calls.push({ input, name: 'countImpact' })
      return impact
    },
    find: async (input) => {
      calls.push({ input, name: 'find' })
      return stored
    },
    save: async (input) => {
      calls.push({ input, name: 'save' })
      stored = {
        purgeEffectiveAt: EFFECTIVE_AT,
        purgeEnabled: input.next.purgeEnabled,
        retentionDays: input.next.retentionDays,
        updatedAt: NOW,
      }
      return stored
    },
  }
  return { calls, port }
}

function routesFor(port: LocationRetentionSettingsPort) {
  const dependencies = { now: () => NOW, settings: port }
  return createLocationRetentionSettingsRoutes({
    clear: createClearLocationRetentionSettingsUseCase(dependencies),
    get: createGetLocationRetentionSettingsUseCase(dependencies),
    impact: createReadLocationRetentionImpactUseCase(dependencies),
    resolveClientIp: () => RESOLVED_IP,
    save: createSaveLocationRetentionSettingsUseCase(dependencies),
  })
}

type CallParams = {
  readonly body?: unknown
  readonly method: 'DELETE' | 'GET' | 'PUT'
  readonly port: LocationRetentionSettingsPort
  readonly query?: string
}

function callRoute(params: CallParams): Promise<Response> {
  const isImpact = params.query !== undefined
  const pathname = isImpact
    ? API_COMPANY_SETTINGS_LOCATION_RETENTION_IMPACT_PATH
    : API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH
  const route = routesFor(params.port).find(
    (candidate) => candidate.method === params.method && candidate.pathname === pathname,
  )
  if (route === undefined) throw new Error(`missing ${params.method} ${pathname}`)

  return route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT } as never,
    correlationId: 'location-retention-contract',
    pathParameters: {},
    request: new Request(`http://api.test${pathname}${params.query ?? ''}`, {
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
  const parsed = (await response.json()) as { readonly data: Record<string, unknown> }
  return parsed.data
}

function bodyRequest(value: unknown): Request {
  return new Request(`http://api.test${API_COMPANY_SETTINGS_LOCATION_RETENTION_PATH}`, {
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejection(attempt: () => Promise<unknown> | unknown): Promise<ApiError> {
  try {
    await attempt()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected a rejection')
}

function expectNoLeak(text: string): void {
  for (const token of LEAK_TOKENS) expect(text).not.toContain(token)
}

describe('location retention settings: body and query (spec 239 RF2, RF4, CA4)', () => {
  test('accepts the whole 30-90 range and both switch positions', async () => {
    for (const retentionDays of [30, 60, 90]) {
      for (const purgeEnabled of [true, false]) {
        expect(
          await parseLocationRetentionSettingsBody(bodyRequest({ purgeEnabled, retentionDays })),
        ).toEqual({ purgeEnabled, retentionDays })
      }
    }
  })

  test('refuses days outside the range, strings and decimals with 400', async () => {
    for (const retentionDays of [29, 91, 0, -30, '90', 90.5, null]) {
      const error = await rejection(() =>
        parseLocationRetentionSettingsBody(bodyRequest({ purgeEnabled: true, retentionDays })),
      )
      expect(error.status).toBe(400)
    }
  })

  test('refuses a non-boolean switch and a missing field with 400', async () => {
    for (const value of [
      { purgeEnabled: 'true', retentionDays: 90 },
      { purgeEnabled: 1, retentionDays: 90 },
      { retentionDays: 90 },
      { purgeEnabled: true },
      {},
    ]) {
      const error = await rejection(() => parseLocationRetentionSettingsBody(bodyRequest(value)))
      expect(error.status).toBe(400)
    }
  })

  test('refuses any extra key: the company never comes from the body', async () => {
    for (const extra of [
      { companyId: OTHER_COMPANY_ID },
      { updatedByUserId: USER_ID },
      { purgeEffectiveAt: EFFECTIVE_AT.toISOString() },
    ]) {
      const error = await rejection(() =>
        parseLocationRetentionSettingsBody(
          bodyRequest({ purgeEnabled: true, retentionDays: 90, ...extra }),
        ),
      )
      expect(error.status).toBe(400)
    }
  })

  test('returns every validation error at once, not the first one', async () => {
    const error = await rejection(() =>
      parseLocationRetentionSettingsBody(
        bodyRequest({ companyId: OTHER_COMPANY_ID, purgeEnabled: 'x', retentionDays: 29 }),
      ),
    )
    const fields = (error.details ?? []).map((detail) => detail.field)

    expect(error.status).toBe(400)
    expect(fields).toContain('purgeEnabled')
    expect(fields).toContain('retentionDays')
    expect(fields.length).toBeGreaterThanOrEqual(3)
  })

  function impactRequest(query: string): Request {
    return new Request(
      `http://api.test${API_COMPANY_SETTINGS_LOCATION_RETENTION_IMPACT_PATH}${query}`,
    )
  }

  test('the impact query takes an integer 30-90, as a plain digit string', () => {
    expect(parseLocationRetentionImpactQuery(impactRequest('?retentionDays=30'))).toEqual({
      retentionDays: 30,
    })
    expect(parseLocationRetentionImpactQuery(impactRequest('?retentionDays=90'))).toEqual({
      retentionDays: 90,
    })
  })

  test('the impact query refuses out of range, decimals, text, empty, repeated and unknown keys', async () => {
    for (const query of [
      '',
      '?retentionDays=29',
      '?retentionDays=91',
      '?retentionDays=90.5',
      '?retentionDays=abc',
      '?retentionDays=',
      '?retentionDays=%2030',
      '?retentionDays=30&retentionDays=60',
      '?retentionDays=30&companyId=' + OTHER_COMPANY_ID,
    ]) {
      const error = await rejection(() => parseLocationRetentionImpactQuery(impactRequest(query)))
      expect(error.status).toBe(400)
    }
  })
})

describe('location retention impact counting (spec 239 D5, RF4)', () => {
  test('counts up to the cap exactly and flags anything beyond it', () => {
    expect(summarizeImpactCount(0)).toEqual({ capped: false, count: 0 })
    expect(summarizeImpactCount(LOCATION_RETENTION_IMPACT_CAP)).toEqual({
      capped: false,
      count: LOCATION_RETENTION_IMPACT_CAP,
    })
    expect(summarizeImpactCount(LOCATION_RETENTION_IMPACT_CAP + 1)).toEqual({
      capped: true,
      count: LOCATION_RETENTION_IMPACT_CAP,
    })
  })

  test('the cap is 100 thousand and the five kinds are stable names, never table names', () => {
    expect(LOCATION_RETENTION_IMPACT_CAP).toBe(100_000)
    expect(Object.values(LOCATION_RETENTION_IMPACT_KIND)).toEqual([
      'stop_event',
      'delivery_proof',
      'status_event',
      'stop_occurrence',
      'document_occurrence',
    ])
  })
})

describe('location retention settings: routes (spec 239 RF1-RF4, CA1-CA5)', () => {
  test('GET without a stored row answers 200 with the default, never 404 (CA1)', async () => {
    const { port } = fakePort(null)
    const response = await callRoute({ method: 'GET', port })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toEqual(DEFAULT_VIEW)
  })

  test('GET with a stored row answers origin company with ISO dates', async () => {
    const { port } = fakePort(STORED)
    const response = await callRoute({ method: 'GET', port })

    expect(await readData(response)).toEqual({
      origin: 'company',
      purgeEffectiveAt: EFFECTIVE_AT.toISOString(),
      purgeEnabled: true,
      retentionDays: 30,
      updatedAt: UPDATED_AT.toISOString(),
    })
  })

  test('PUT saves for the context company, resolved IP and injected clock, then answers the view', async () => {
    const { calls, port } = fakePort(null)
    const response = await callRoute({
      body: { purgeEnabled: true, retentionDays: 60 },
      method: 'PUT',
      port,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toMatchObject({
      origin: 'company',
      purgeEnabled: true,
      retentionDays: 60,
    })
    const save = calls.find((call) => call.name === 'save')
    expect(save?.input).toMatchObject({
      companyId: COMPANY_ID,
      correlationId: 'location-retention-contract',
      ipAddress: RESOLVED_IP,
      next: { purgeEnabled: true, retentionDays: 60 },
      now: NOW,
      userId: USER_ID,
    })
    expect(JSON.stringify(save?.input)).not.toContain(FORGED_IP)
  })

  test('PUT hands the audit the estimate the screen showed: server-side, summed, capped flag', async () => {
    const enabling = fakePort(null)
    await callRoute({ body: { purgeEnabled: true, retentionDays: 30 }, method: 'PUT', port: enabling.port })
    expect(enabling.calls.find((call) => call.name === 'countImpact')?.input).toEqual({
      companyId: COMPANY_ID,
      now: NOW,
      retentionDays: 30,
    })
    expect(enabling.calls.find((call) => call.name === 'save')?.input).toMatchObject({
      affectedEstimate: { capped: true, count: 3 + LOCATION_RETENTION_IMPACT_CAP + 5 + 1 },
    })

    const disabling = fakePort(STORED)
    await callRoute({ body: { purgeEnabled: false, retentionDays: 30 }, method: 'PUT', port: disabling.port })
    expect(disabling.calls.some((call) => call.name === 'countImpact')).toBe(false)
    expect(disabling.calls.find((call) => call.name === 'save')?.input).toMatchObject({
      affectedEstimate: null,
    })
  })

  test('DELETE answers 204, clears for the context company and GET falls back to the default (CA3)', async () => {
    const { calls, port } = fakePort(STORED)
    const response = await callRoute({ method: 'DELETE', port })

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls.find((call) => call.name === 'clear')?.input).toMatchObject({
      companyId: COMPANY_ID,
      correlationId: 'location-retention-contract',
      ipAddress: RESOLVED_IP,
      userId: USER_ID,
    })
    expect(await readData(await callRoute({ method: 'GET', port }))).toEqual(DEFAULT_VIEW)
  })

  test('DELETE is idempotent: a second call is still 204', async () => {
    const { port } = fakePort(null)
    expect((await callRoute({ method: 'DELETE', port })).status).toBe(204)
    expect((await callRoute({ method: 'DELETE', port })).status).toBe(204)
  })

  test('impact counts the context company only, at the injected clock, per kind (CA5)', async () => {
    const { calls, port } = fakePort(null)
    const response = await callRoute({ method: 'GET', port, query: '?retentionDays=45' })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toEqual({ byTable: IMPACT })
    expect(calls.find((call) => call.name === 'countImpact')?.input).toEqual({
      companyId: COMPANY_ID,
      now: NOW,
      retentionDays: 45,
    })
    expect(JSON.stringify(calls)).not.toContain(OTHER_COMPANY_ID)
  })

  test('impact refuses a bad retentionDays before touching the port', async () => {
    const { calls, port } = fakePort(null)
    const failure = await rejection(() => callRoute({ method: 'GET', port, query: '?retentionDays=91' }))

    expect(failure.status).toBe(400)
    expect(calls).toEqual([])
  })

  test('no response carries a coordinate, an event id, a user id or an event date (CA5)', async () => {
    const { port } = fakePort(LEAKY_STORED, LEAKY_IMPACT)
    const texts = [
      await (await callRoute({ method: 'GET', port })).text(),
      await (
        await callRoute({ body: { purgeEnabled: true, retentionDays: 30 }, method: 'PUT', port })
      ).text(),
      await (await callRoute({ method: 'GET', port, query: '?retentionDays=30' })).text(),
    ]

    expect(texts.every((text) => text.length > 0)).toBe(true)
    for (const text of texts) expectNoLeak(text)
  })
})

describe('location retention settings: wiring (spec 239 D4)', () => {
  test('the four routes live under settings.manage, company scope, at the agreed paths', () => {
    const { port } = fakePort(null)
    const routes = routesFor(port)

    expect(routes.map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'GET /company-settings/location-retention',
      'PUT /company-settings/location-retention',
      'DELETE /company-settings/location-retention',
      'GET /company-settings/location-retention/impact',
    ])
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })

  test('the routes read the company from the context only', () => {
    const routes = readFileSync(
      new URL(
        '../../src/companies/presentation/location-retention-settings.routes.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(routes.match(/companyId: context\.scope\.companyId/g)?.length).toBe(4)
    expect(routes).not.toContain('input.companyId')
  })

  test('the client IP comes from the injected resolver, never from a raw header', () => {
    const routes = readFileSync(
      new URL(
        '../../src/companies/presentation/location-retention-settings.routes.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(routes).toContain('resolveClientIp(request)')
    expect(routes).not.toMatch(/x-forwarded-for|x-real-ip|cf-connecting-ip/i)
  })

  test('every repository statement is scoped by company and the audit shares the transaction', () => {
    const repository = readFileSync(
      new URL(
        '../../src/companies/infrastructure/drizzle-location-retention-settings.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const wheres = repository.match(/\.where\(\s*and\([^;]*?\)\s*\)|\.where\([^)]*\)/g) ?? []

    expect(wheres.length).toBeGreaterThanOrEqual(3)
    for (const where of wheres) expect(where).toMatch(/\.companyId/)
    expect(repository).toContain('transaction.insert(auditLogs)')
    expect(repository).not.toContain('this.database.insert(auditLogs)')
  })
})
