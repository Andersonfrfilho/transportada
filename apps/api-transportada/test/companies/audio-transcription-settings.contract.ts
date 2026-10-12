/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.4 (contract.md §5.1): `GET`/`PUT /company-settings/audio-transcription`. Sem linha a empresa está ligada
 * (resposta válida, nunca 404); o corpo é `{ enabled }` `.strict()`; a resposta é lista branca; a empresa e o IP vêm do
 * contexto, nunca do corpo ou do cabeçalho de quem chama.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import type {
  AudioTranscriptionSettings,
  AudioTranscriptionSettingsPort,
} from '../../src/companies/application/audio-transcription-settings.port.js'
import {
  createGetAudioTranscriptionSettingsUseCase,
  createSaveAudioTranscriptionSettingsUseCase,
} from '../../src/companies/application/audio-transcription-settings.use-case.js'
import { createAudioTranscriptionSettingsRoutes } from '../../src/companies/presentation/audio-transcription-settings.routes.js'
import { parseAudioTranscriptionSettingsBody } from '../../src/companies/presentation/audio-transcription-settings.schema.js'
import { parseEnvironment } from '../../src/config/environment.schema.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-10-12T11:00:00.000Z')
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

type PortCall = { readonly name: string; readonly input: Record<string, unknown> }

function fakePort(initial: AudioTranscriptionSettings) {
  let stored = initial
  const calls: PortCall[] = []
  const port: AudioTranscriptionSettingsPort = {
    find: async (input) => {
      calls.push({ input, name: 'find' })
      return stored
    },
    save: async (input) => {
      calls.push({ input, name: 'save' })
      stored = { enabled: input.enabled, updatedAt: UPDATED_AT }
      return stored
    },
  }
  return { calls, port }
}

function routesFor(port: AudioTranscriptionSettingsPort) {
  return createAudioTranscriptionSettingsRoutes({
    get: createGetAudioTranscriptionSettingsUseCase({ settings: port }),
    maxDurationMs: MAX_DURATION_MS,
    resolveClientIp: () => RESOLVED_IP,
    save: createSaveAudioTranscriptionSettingsUseCase({ settings: port }),
  })
}

function callRoute(params: {
  readonly body?: unknown
  readonly method: 'GET' | 'PUT'
  readonly port: AudioTranscriptionSettingsPort
}): Promise<Response> {
  const route = routesFor(params.port).find(
    (candidate) =>
      candidate.method === params.method &&
      candidate.pathname === API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH,
  )
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

describe('audio transcription settings: body (spec 264 T2.4, contract §5.1)', () => {
  test('accepts both switch positions', async () => {
    for (const enabled of [true, false]) {
      expect(await parseAudioTranscriptionSettingsBody(bodyRequest({ enabled }))).toEqual({
        enabled,
      })
    }
  })

  test('refuses a non-boolean, a missing field and a null with 400', async () => {
    for (const value of [{ enabled: 'true' }, { enabled: 1 }, { enabled: null }, {}]) {
      const error = await rejection(() => parseAudioTranscriptionSettingsBody(bodyRequest(value)))
      expect(error.status).toBe(400)
    }
  })

  test('refuses any extra key: the company never comes from the body', async () => {
    for (const extra of [
      { companyId: OTHER_COMPANY_ID },
      { maxDurationMs: 1000 },
      { updatedAt: UPDATED_AT.toISOString() },
    ]) {
      const error = await rejection(() =>
        parseAudioTranscriptionSettingsBody(bodyRequest({ enabled: true, ...extra })),
      )
      expect(error.status).toBe(400)
    }
  })

  test('returns every validation error at once', async () => {
    const error = await rejection(() =>
      parseAudioTranscriptionSettingsBody(
        bodyRequest({ companyId: OTHER_COMPANY_ID, enabled: 'x' }),
      ),
    )
    const fields = (error.details ?? []).map((detail) => detail.field)
    expect(fields).toContain('enabled')
    expect(fields.length).toBeGreaterThanOrEqual(2)
  })
})

describe('audio transcription settings: routes (spec 264 T2.4, contract §5.1)', () => {
  test('both verbs ask settings.manage in the company scope', () => {
    const routes = routesFor(fakePort({ enabled: true, updatedAt: null }).port)
    expect(routes.map((route) => route.method).toSorted()).toEqual(['GET', 'PUT'])
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
      expect(route.pathname).toBe('/company-settings/audio-transcription')
    }
  })

  test('GET without a stored decision answers 200: enabled, the ceiling and updatedAt null; never 404', async () => {
    const response = await callRoute({
      method: 'GET',
      port: fakePort({ enabled: true, updatedAt: null }).port,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toEqual({
      enabled: true,
      maxDurationMs: MAX_DURATION_MS,
      updatedAt: null,
    })
  })

  test('GET after a decision answers the ISO date and exactly three keys (white list)', async () => {
    const leaky = {
      enabled: false,
      enabledSince: new Date(),
      routineStartedAt: new Date(),
      updatedAt: UPDATED_AT,
      updatedByUserId: USER_ID,
    } as unknown as AudioTranscriptionSettings
    const response = await callRoute({ method: 'GET', port: fakePort(leaky).port })
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      data: { enabled: false, maxDurationMs: MAX_DURATION_MS, updatedAt: UPDATED_AT.toISOString() },
    })
    expect(text).not.toContain(USER_ID)
  })

  test('PUT saves for the context company, user and resolved IP, never the forged header', async () => {
    const { calls, port } = fakePort({ enabled: true, updatedAt: null })
    const response = await callRoute({ body: { enabled: false }, method: 'PUT', port })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await readData(response)).toEqual({
      enabled: false,
      maxDurationMs: MAX_DURATION_MS,
      updatedAt: UPDATED_AT.toISOString(),
    })
    const save = calls.find((call) => call.name === 'save')
    expect(save?.input).toEqual({
      companyId: COMPANY_ID,
      correlationId: 'audio-transcription-contract',
      enabled: false,
      ipAddress: RESOLVED_IP,
      userId: USER_ID,
    })
    expect(JSON.stringify(save?.input)).not.toContain(FORGED_IP)
  })

  test('PUT with an invalid body never reaches the port', async () => {
    const { calls, port } = fakePort({ enabled: true, updatedAt: null })
    await expect(
      callRoute({ body: { enabled: 'yes' }, method: 'PUT', port }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(calls).toEqual([])
  })
})

describe('audio transcription settings: environment and source (spec 264 T2.4)', () => {
  test('AUDIO_TRANSCRIPTION_MAX_DURATION_MS defaults to 600000 and is read from the environment', () => {
    expect(parseEnvironment(API_ENVIRONMENT).audioTranscriptionMaxDurationMs).toBe(600_000)
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '120000' })
        .audioTranscriptionMaxDurationMs,
    ).toBe(120_000)
  })

  test('refuses a ceiling outside 1 s to 1 h, decimals and text', () => {
    for (const value of ['999', '3600001', '1.5', 'abc']) {
      expect(() =>
        parseEnvironment({ ...API_ENVIRONMENT, AUDIO_TRANSCRIPTION_MAX_DURATION_MS: value }),
      ).toThrow()
    }
  })

  test('the repository filters by the context company, takes FOR UPDATE and uses the database clock', async () => {
    const source = await readFile(
      new URL(
        '../../src/companies/infrastructure/drizzle-audio-transcription-settings.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toInclude(".for('update')")
    expect(source).toInclude('now()')
    expect(source).not.toMatch(/new Date\(/)
    expect(source).toInclude('companyAudioTranscriptionSettings.companyId')
    expect(source).toInclude('auditLogs')
  })
})
