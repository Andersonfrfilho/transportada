/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type {
  AudioTranscriptionSettingsPort,
  AudioTranscriptionStoredSettings,
} from '../../src/companies/application/audio-transcription-settings.port.js'
import {
  createGetAudioTranscriptionSettingsUseCase,
  createSaveAudioTranscriptionSettingsUseCase,
} from '../../src/companies/application/audio-transcription-settings.use-case.js'
import { createAudioTranscriptionSettingsRoutes } from '../../src/companies/presentation/audio-transcription-settings.routes.js'
import { parseAudioTranscriptionSettingsBody } from '../../src/companies/presentation/audio-transcription-settings.schema.js'
import { parseEnvironment } from '../../src/config/environment.schema.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import {
  COMPANY_ROLE_PERMISSIONS,
  resolveCompanyPermissions,
} from '../../src/identity/domain/authorization.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

/**
 * Spec 264 T2.4 (RF17, D9): a configuração da transcrição por empresa. Sem linha vale ligada, o
 * corpo é estrito e a empresa vem só do contexto. A auditoria só na mudança e o `enabled_since`
 * ao religar são do repositório e ficam na integração com Postgres.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-10-12T10:00:00.000Z')
const RESOLVED_IP = '10.0.0.9'
const FORGED_IP = '6.6.6.6'
const MAX_DURATION_MS = 600_000

const MANAGER_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

type SaveCall = Record<string, unknown>

function fakePort(initial: AudioTranscriptionStoredSettings) {
  let stored = initial
  const saves: SaveCall[] = []
  const finds: Record<string, unknown>[] = []
  const port: AudioTranscriptionSettingsPort = {
    find: async (params) => {
      finds.push(params)
      return stored
    },
    save: async (params) => {
      saves.push(params)
      stored = { enabled: params.enabled, updatedAt: UPDATED_AT }
      return stored
    },
  }
  return { finds, port, saves }
}

function routesFor(port: AudioTranscriptionSettingsPort) {
  const dependencies = { maxDurationMs: MAX_DURATION_MS, settings: port }
  return createAudioTranscriptionSettingsRoutes({
    get: createGetAudioTranscriptionSettingsUseCase(dependencies),
    resolveClientIp: () => RESOLVED_IP,
    save: createSaveAudioTranscriptionSettingsUseCase(dependencies),
  })
}

function callRoute(params: {
  readonly body?: unknown
  readonly method: 'GET' | 'PUT'
  readonly port: AudioTranscriptionSettingsPort
}): Promise<Response> {
  const route = routesFor(params.port).find((candidate) => candidate.method === params.method)
  if (route === undefined) throw new Error(`missing ${params.method}`)

  return route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT } as never,
    correlationId: 'audio-transcription-contract',
    pathParameters: {},
    request: new Request(`http://api.test${API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH}`, {
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
  return new Request(`http://api.test${API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH}`, {
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

function readSource(relative: string): string {
  return readFileSync(new URL(`../../src/companies/${relative}`, import.meta.url), 'utf8')
}

describe('audio transcription settings: body (spec 264 RF17)', () => {
  test('accepts both switch positions', async () => {
    for (const enabled of [true, false]) {
      expect(await parseAudioTranscriptionSettingsBody(bodyRequest({ enabled }))).toEqual({
        enabled,
      })
    }
  })

  test('refuses a non-boolean, null and a missing switch with 400', async () => {
    for (const value of [{ enabled: 'true' }, { enabled: 1 }, { enabled: null }, {}]) {
      const error = await rejection(() => parseAudioTranscriptionSettingsBody(bodyRequest(value)))
      expect(error.status).toBe(400)
    }
  })

  test('refuses any extra key: the company never comes from the body', async () => {
    for (const extra of [
      { companyId: OTHER_COMPANY_ID },
      { updatedByUserId: USER_ID },
      { enabledSince: UPDATED_AT.toISOString() },
      { maxDurationMs: 1 },
    ]) {
      const error = await rejection(() =>
        parseAudioTranscriptionSettingsBody(bodyRequest({ enabled: true, ...extra })),
      )
      expect(error.status).toBe(400)
    }
  })

  test('returns every validation error at once, with a stable code', async () => {
    const error = await rejection(() =>
      parseAudioTranscriptionSettingsBody(
        bodyRequest({ companyId: OTHER_COMPANY_ID, enabled: 'x', routineStartedAt: 'now' }),
      ),
    )

    expect(error.status).toBe(400)
    expect(error.code).toBe('INVALID_REQUEST')
    expect(error.details?.length).toBeGreaterThanOrEqual(2)
    expect((error.details ?? []).map((detail) => detail.field)).toContain('enabled')
  })
})

describe('audio transcription settings: routes (spec 264 RF17, D9)', () => {
  test('GET without a row answers enabled, no update date and the read-only ceiling', async () => {
    const { port } = fakePort({ enabled: true, updatedAt: null })
    const response = await callRoute({ method: 'GET', port })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toEqual({
      enabled: true,
      maxDurationMs: MAX_DURATION_MS,
      updatedAt: null,
    })
  })

  test('PUT hands the port the context company and actor, the resolved IP and the correlation id', async () => {
    const { port, saves } = fakePort({ enabled: true, updatedAt: null })
    await callRoute({ body: { enabled: false }, method: 'PUT', port })

    expect(saves).toEqual([
      {
        companyId: COMPANY_ID,
        correlationId: 'audio-transcription-contract',
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

    expect(written).toEqual({
      enabled: false,
      maxDurationMs: MAX_DURATION_MS,
      updatedAt: UPDATED_AT.toISOString(),
    })
    expect(read).toEqual(written)
  })

  test('the answer is a whitelist: a leaky stored object does not spread', async () => {
    const leaky = {
      companyId: OTHER_COMPANY_ID,
      enabled: true,
      enabledSince: UPDATED_AT,
      routineStartedAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
      updatedByUserId: USER_ID,
    } as unknown as AudioTranscriptionStoredSettings
    const { port } = fakePort(leaky)
    const text = await (await callRoute({ method: 'GET', port })).text()

    expect(Object.keys(JSON.parse(text).data).sort()).toEqual([
      'enabled',
      'maxDurationMs',
      'updatedAt',
    ])
    for (const token of [OTHER_COMPANY_ID, USER_ID, 'enabledSince', 'routineStartedAt']) {
      expect(text).not.toContain(token)
    }
  })

  test('both routes live under settings.manage, company scope, at the agreed path', () => {
    const routes = routesFor(fakePort({ enabled: true, updatedAt: null }).port)

    expect(routes.map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'GET /company-settings/audio-transcription',
      'PUT /company-settings/audio-transcription',
    ])
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })

  test('the routes read the company from the context and the IP from the injected resolver', () => {
    const routes = readSource('presentation/audio-transcription-settings.routes.ts')

    expect(routes.match(/companyId: context\.scope\.companyId/g)?.length).toBe(2)
    expect(routes).not.toContain('input.companyId')
    expect(routes).toContain('resolveClientIp(request)')
    expect(routes).not.toMatch(/x-forwarded-for|x-real-ip|cf-connecting-ip/i)
  })
})

describe('audio transcription settings: authorization by role (spec 264 RF17)', () => {
  const authorization = new AuthorizationService()
  const roles = Object.keys(COMPANY_ROLE_PERMISSIONS) as (keyof typeof COMPANY_ROLE_PERMISSIONS)[]

  function contextOf(role: keyof typeof COMPANY_ROLE_PERMISSIONS) {
    return {
      identity: {
        companyIdClaim: COMPANY_ID,
        externalIdentityId: '00000000-0000-4000-8000-000000000004',
        issuer: 'https://issuer.test',
        platformAdmin: false,
        serviceAccount: false,
        subject: role,
        userId: USER_ID,
      },
      scope: {
        ...MANAGER_CONTEXT,
        permissions: resolveCompanyPermissions([role]),
        roles: [role],
      },
    }
  }

  function failureOf(attempt: () => void): unknown {
    try {
      attempt()
    } catch (error) {
      return error
    }
    return undefined
  }

  test('only company-admin passes; every other role gets 403 from the real service', () => {
    const routes = routesFor(fakePort({ enabled: true, updatedAt: null }).port)

    for (const role of roles) {
      for (const route of routes) {
        const failure = failureOf(() => authorization.authorize(contextOf(role), route.policy))
        if (role === 'company-admin') {
          expect(failure, `${role} ${route.method}`).toBeUndefined()
          continue
        }
        expect(failure, `${role} ${route.method}`).toBeInstanceOf(ApiError)
        expect((failure as ApiError).status).toBe(403)
      }
    }
  })
})

describe('audio transcription settings: repository source (spec 264 §5.1, D9)', () => {
  const repository = readSource('infrastructure/drizzle-audio-transcription-settings.repository.ts')

  test('every statement is scoped by company and the audit shares the transaction', () => {
    const wheres = repository.match(/\.where\([^)]*\)/g) ?? []

    expect(wheres.length).toBeGreaterThanOrEqual(2)
    for (const where of wheres)
      expect(where).toContain('companyAudioTranscriptionSettings.companyId')
    expect(repository).toContain('target: companyAudioTranscriptionSettings.companyId')
    expect(repository).toContain('transaction.insert(auditLogs)')
    expect(repository).not.toContain('this.database.insert(auditLogs)')
  })

  test('the previous value is read under lock, and the upsert takes the database clock', () => {
    expect(repository).toContain('acquireAudioTranscriptionLock(transaction, companyId)')
    expect(repository).toContain(".for('update')")
    expect(repository).toContain('onConflictDoUpdate')
    expect(repository).not.toMatch(/new Date|Date\.now/)
    expect(repository.match(/updatedAt: DATABASE_NOW/g)?.length).toBe(2)
  })

  test('the unchanged value returns before any write or audit', () => {
    const guard = repository.indexOf('if (previousEnabled === params.enabled)')

    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(repository.indexOf('.insert(companyAudioTranscriptionSettings)'))
    expect(guard).toBeLessThan(repository.indexOf('appendAudit(transaction'))
  })

  test('enabled_since is rewritten only on re-enabling, and the routine marker is never touched', () => {
    const update = repository.slice(repository.indexOf('set: {'), repository.indexOf('target:'))

    expect(update).toContain('...(isReenabling ? { enabledSince: DATABASE_NOW } : {})')
    expect(update.match(/enabledSince/g)?.length).toBe(1)
    expect(repository).not.toMatch(/routineStartedAt|routine_started_at/)
  })

  test('the audit keeps actor, both values, IP and correlation, and no conversation content', () => {
    expect(repository).toContain('correlationId: params.actor.correlationId')
    expect(repository).toContain('metadata: { ipAddress: params.actor.ipAddress }')
    expect(repository).toContain('afterSnapshot: { enabled: params.after }')
    expect(repository).toContain('beforeSnapshot: { enabled: params.before }')
    expect(repository).not.toMatch(/transcri(ption)?Text|\.text\b/)
  })
})

describe('audio transcription settings: ceiling in the environment (contract.md §5.1)', () => {
  test('defaults to 600000 when absent or blank, and reads a declared value', () => {
    expect(parseEnvironment(API_ENVIRONMENT).audioTranscriptionMaxDurationMs).toBe(600_000)
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '' })
        .audioTranscriptionMaxDurationMs,
    ).toBe(600_000)
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '120000' })
        .audioTranscriptionMaxDurationMs,
    ).toBe(120_000)
  })

  test('fails the boot on a ceiling that is not a sane integer', () => {
    for (const invalid of ['abc', '0', '-5', '1.5', '999999999']) {
      expect(() =>
        parseEnvironment({ ...API_ENVIRONMENT, AUDIO_TRANSCRIPTION_MAX_DURATION_MS: invalid }),
      ).toThrow()
    }
  })

  test('.env.example declares the variable with the default', () => {
    const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8')

    expect(example).toContain('\nAUDIO_TRANSCRIPTION_MAX_DURATION_MS=600000\n')
  })
})
