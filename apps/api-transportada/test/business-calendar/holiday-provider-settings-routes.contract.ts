/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T3.3 (RF3–RF5, CA2, CA3): as rotas da chave da FeriadosAPI pelo roteador de verdade. Lista branca na
 * resposta, `400` sem eco da chave, `403` para `settings.manage` sem a permissão dedicada, `409` de versão,
 * `429` no 11º pedido e a política de cada verbo.
 */
import { describe, expect, test } from 'bun:test'

import type { HolidayProviderSettingsRecord } from '../../src/business-calendar/application/holiday-provider-settings.port.js'
import type {
  HolidayProviderSettingsUseCases,
  SaveHolidayProviderSettingsCommand,
} from '../../src/business-calendar/application/holiday-provider-settings.use-case.js'
import { HolidayProviderSettingsVersionConflictError } from '../../src/business-calendar/domain/holiday-provider-settings.error.js'
import { createHolidayProviderSettingsRoutes } from '../../src/business-calendar/presentation/holiday-provider-settings.routes.js'
import {
  CLIENT_IP,
  CONFIGURE_PERMISSIONS,
  PROVIDER_SETTINGS_PATH,
  PROVIDER_TOKEN_PATH,
  SENTINEL_TOKEN,
  createHolidayProviderSettingsHttpFixture,
  getRequest,
  writeRequest,
} from '../fixtures/holiday-provider-settings-http.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000262c1'
const USER_ID = '00000000-0000-4000-8000-0000000262c2'
const SETTINGS_ID = '00000000-0000-4000-8000-0000000262c3'

const RECORD: HolidayProviderSettingsRecord = {
  id: SETTINGS_ID,
  monthlyRequestBudget: 3000,
  tokenConfigured: true,
  tokenHint: '0042',
  tokenUpdatedAt: new Date('2026-10-09T15:00:00.000Z'),
  updatedAt: new Date('2026-10-09T15:00:00.000Z'),
  version: 4n,
}

const VIEW_KEYS = [
  'budgetOrigin',
  'monthlyRequestBudget',
  'tokenConfigured',
  'tokenHint',
  'tokenUpdatedAt',
  'updatedAt',
  'version',
]

type Calls = { removed: unknown[]; saved: SaveHolidayProviderSettingsCommand[] }

function fixture(
  overrides: {
    readonly permissions?: readonly string[]
    readonly rateLimitWindows?: Parameters<
      typeof createHolidayProviderSettingsHttpFixture
    >[0]['rateLimitWindows']
    readonly record?: HolidayProviderSettingsRecord | null
    readonly saveError?: Error
  } = {},
) {
  const calls: Calls = { removed: [], saved: [] }
  const useCases: HolidayProviderSettingsUseCases = {
    get: { execute: async () => (overrides.record === undefined ? RECORD : overrides.record) },
    removeToken: {
      execute: async (input) => {
        calls.removed.push(input)
      },
    },
    save: {
      execute: async (input) => {
        calls.saved.push(input)
        if (overrides.saveError !== undefined) throw overrides.saveError
        return RECORD
      },
    },
  }
  const http = createHolidayProviderSettingsHttpFixture({
    companyId: COMPANY_ID,
    permissions: overrides.permissions ?? CONFIGURE_PERMISSIONS,
    ...(overrides.rateLimitWindows === undefined
      ? {}
      : { rateLimitWindows: overrides.rateLimitWindows }),
    useCases,
    userId: USER_ID,
  })
  return { ...http, calls }
}

async function putBody(
  context: ReturnType<typeof fixture>,
  body: unknown,
): Promise<{ readonly response: Response; readonly text: string }> {
  const response = await context.handle(
    writeRequest({ body, method: 'PUT', path: PROVIDER_SETTINGS_PATH }),
  )
  return { response, text: await response.text() }
}

describe('GET /holiday-imports/provider-settings (spec 262 RF3)', () => {
  test('answers the exact allowlist, never the envelope, who changed it or the row id', async () => {
    const polluted = {
      ...RECORD,
      tokenEnvelope: { ciphertext: 'sealed-bytes' },
      updatedByUserId: USER_ID,
    } as unknown as HolidayProviderSettingsRecord
    const context = fixture({ record: polluted })

    const response = await context.handle(getRequest(PROVIDER_SETTINGS_PATH))
    const text = await response.text()
    const body = JSON.parse(text) as { data: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys(body.data).sort()).toEqual(VIEW_KEYS)
    expect(body.data).toEqual({
      budgetOrigin: 'installation',
      monthlyRequestBudget: 3000,
      tokenConfigured: true,
      tokenHint: '0042',
      tokenUpdatedAt: '2026-10-09T15:00:00.000Z',
      updatedAt: '2026-10-09T15:00:00.000Z',
      version: '4',
    })
    for (const leak of ['sealed-bytes', 'ciphertext', USER_ID, SETTINGS_ID]) {
      expect(text).not.toContain(leak)
    }
  })

  test('without a row answers the default budget, no key and a null version', async () => {
    const context = fixture({ record: null })

    const response = await context.handle(getRequest(PROVIDER_SETTINGS_PATH))

    expect(await response.json()).toEqual({
      data: {
        budgetOrigin: 'default',
        monthlyRequestBudget: 4500,
        tokenConfigured: false,
        tokenHint: null,
        tokenUpdatedAt: null,
        updatedAt: null,
        version: null,
      },
    })
  })

  test('is readable with settings.manage alone, and refused without it', async () => {
    const reader = fixture({ permissions: ['settings.manage'] })
    const outsider = fixture({ permissions: ['holiday-import.configure'] })

    expect((await reader.handle(getRequest(PROVIDER_SETTINGS_PATH))).status).toBe(200)
    expect((await outsider.handle(getRequest(PROVIDER_SETTINGS_PATH))).status).toBe(403)
  })
})

describe('PUT /holiday-imports/provider-settings (spec 262 RF4)', () => {
  test('hands the use case the trimmed token, the budget, the version and the actor', async () => {
    const context = fixture()

    const { response, text } = await putBody(context, {
      expectedVersion: '4',
      monthlyRequestBudget: 2500,
      token: `  ${SENTINEL_TOKEN}  `,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(text).not.toContain(SENTINEL_TOKEN)
    expect(context.calls.saved).toHaveLength(1)
    expect(context.calls.saved[0]).toMatchObject({
      companyId: COMPANY_ID,
      expectedVersion: 4n,
      ipAddress: CLIENT_IP,
      monthlyRequestBudget: 2500,
      token: SENTINEL_TOKEN,
      userId: USER_ID,
    })
  })

  test('accepts the budget alone and the token alone, leaving the other undefined', async () => {
    const context = fixture()

    await putBody(context, { monthlyRequestBudget: 1 })
    await putBody(context, { token: 'a'.repeat(16) })

    expect(context.calls.saved[0]).toMatchObject({ expectedVersion: undefined, token: undefined })
    expect(context.calls.saved[1]).toMatchObject({ monthlyRequestBudget: undefined })
  })

  test('refuses what is not allowed with 400 and never echoes the key back', async () => {
    const longToken = `${SENTINEL_TOKEN}${'x'.repeat(600)}`
    const bodies: readonly unknown[] = [
      {},
      { token: 'curta-demais' },
      { token: longToken },
      { token: 'chave com espaço no meio 12345678' },
      { token: `acentuação-${SENTINEL_TOKEN}` },
      { token: `${SENTINEL_TOKEN}\u0007` },
      { token: 12_345_678_901_234_567 },
      { monthlyRequestBudget: 0 },
      { monthlyRequestBudget: 1_000_001 },
      { monthlyRequestBudget: 1.5 },
      { monthlyRequestBudget: '2500' },
      { monthlyRequestBudget: 2500, token: SENTINEL_TOKEN, companyId: COMPANY_ID },
      { monthlyRequestBudget: 2500, token: SENTINEL_TOKEN, extra: 'x' },
      { monthlyRequestBudget: 2500, token: SENTINEL_TOKEN, expectedVersion: 4 },
      { monthlyRequestBudget: 2500, token: SENTINEL_TOKEN, expectedVersion: '0' },
      { monthlyRequestBudget: 2500, token: SENTINEL_TOKEN, expectedVersion: 'abc' },
    ]

    for (const body of bodies) {
      const context = fixture()

      const { response, text } = await putBody(context, body)

      expect({ body: JSON.stringify(body).slice(0, 60), status: response.status }).toEqual({
        body: JSON.stringify(body).slice(0, 60),
        status: 400,
      })
      expect(text).not.toContain(SENTINEL_TOKEN)
      expect(text).not.toContain('chave com espaço')
      expect(context.calls.saved).toHaveLength(0)
      expect(context.logs.join('\n')).not.toContain(SENTINEL_TOKEN)
    }
  })

  test('names the field and the rule on a bad token, nothing else', async () => {
    const context = fixture()

    const { text } = await putBody(context, { token: 'short' })

    expect(text).toContain('token')
    expect(text).toContain('16 to 512')
  })

  test('answers 403 to settings.manage without holiday-import.configure, even to the owner of the group', async () => {
    const context = fixture({ permissions: ['settings.manage'] })

    const put = await putBody(context, { monthlyRequestBudget: 100 })
    const del = await context.handle(writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }))

    expect(put.response.status).toBe(403)
    expect(del.status).toBe(403)
    expect(context.calls.saved).toHaveLength(0)
    expect(context.calls.removed).toHaveLength(0)
  })

  test('answers 409 when the version is stale, with a stable code and without the key', async () => {
    const context = fixture({ saveError: new HolidayProviderSettingsVersionConflictError() })

    const { response, text } = await putBody(context, {
      expectedVersion: '1',
      token: SENTINEL_TOKEN,
    })

    expect(response.status).toBe(409)
    expect(JSON.parse(text)).toMatchObject({
      error: { code: 'HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT' },
    })
    expect(text).not.toContain(SENTINEL_TOKEN)
  })

  test('answers 429 on the 11th write of the hour, and the refused ones never reach the use case', async () => {
    const consumed: { maxRequests: number; scope: string; windowSeconds: number }[] = []
    const context = fixture({
      rateLimitWindows: {
        consume: async (params) => {
          consumed.push({
            maxRequests: params.maxRequests,
            scope: params.scope,
            windowSeconds: params.windowSeconds,
          })
          return consumed.length <= params.maxRequests
            ? { allowed: true }
            : { allowed: false, retryAfterSeconds: 120 }
        },
      },
    })

    const statuses: number[] = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await putBody(context, { monthlyRequestBudget: 100 })).response.status)
    }

    expect(statuses.slice(0, 10)).toEqual(new Array<number>(10).fill(200))
    expect(statuses[10]).toBe(429)
    expect(context.calls.saved).toHaveLength(10)
    expect(consumed[0]).toEqual({
      maxRequests: 10,
      scope: 'holiday-provider-settings',
      windowSeconds: 3600,
    })
  })
})

describe('DELETE /holiday-imports/provider-settings/token (spec 262 RF5)', () => {
  test('answers 204 without a body and hands the use case the actor', async () => {
    const context = fixture()

    const response = await context.handle(
      writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(context.calls.removed[0]).toMatchObject({
      companyId: COMPANY_ID,
      ipAddress: CLIENT_IP,
      userId: USER_ID,
    })
  })

  test('shares the write bucket with the PUT', async () => {
    const scopes: string[] = []
    const context = fixture({
      rateLimitWindows: {
        consume: async (params) => {
          scopes.push(`${params.scope}:${params.maxRequests}:${params.windowSeconds}`)
          return { allowed: true }
        },
      },
    })

    await putBody(context, { monthlyRequestBudget: 100 })
    await context.handle(writeRequest({ method: 'DELETE', path: PROVIDER_TOKEN_PATH }))
    await context.handle(getRequest(PROVIDER_SETTINGS_PATH))

    expect(scopes).toEqual([
      'holiday-provider-settings:10:3600',
      'holiday-provider-settings:10:3600',
    ])
  })
})

describe('the route table (spec 262 D2)', () => {
  test('reads with settings.manage, writes with holiday-import.configure and the postgres bucket', () => {
    const unused = new Proxy(() => undefined, {
      apply: () => undefined,
      get: () => unused,
    }) as never
    const routes = createHolidayProviderSettingsRoutes(unused)

    expect(
      routes.map((route) => ({
        permission: route.policy?.permission,
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      })),
    ).toEqual([
      {
        permission: 'settings.manage',
        rateLimit: undefined,
        signature: 'GET /holiday-imports/provider-settings',
      },
      {
        permission: 'holiday-import.configure',
        rateLimit: {
          maxRequests: 10,
          scope: 'holiday-provider-settings',
          store: 'postgres',
          windowSeconds: 3600,
        },
        signature: 'PUT /holiday-imports/provider-settings',
      },
      {
        permission: 'holiday-import.configure',
        rateLimit: {
          maxRequests: 10,
          scope: 'holiday-provider-settings',
          store: 'postgres',
          windowSeconds: 3600,
        },
        signature: 'DELETE /holiday-imports/provider-settings/token',
      },
    ])
  })
})
