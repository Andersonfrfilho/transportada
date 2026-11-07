/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T4.2 (RF19): o corpo da configuração da cobrança é fechado, cada faixa é validada e todos os erros
 * voltam de uma vez; a rota é de `settings.manage` e a empresa vem só do contexto.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverStopReminderSettingsPort } from '../../src/driver-stop-reminders/application/driver-stop-reminder-settings.port.js'
import { DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import { createDriverStopReminderSettingsRoutes } from '../../src/driver-stop-reminders/presentation/driver-stop-reminder-settings.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import { FRONTEND_ORIGIN, jsonRequest } from '../fixtures/trip-http-payload.fixture.js'

const PATH = '/settings/driver-stop-reminders'
const UPDATED_AT = new Date('2026-11-07T15:00:00.000Z')
const VALID_BODY = {
  dwellMinutes: 20,
  enabled: true,
  graceMinMinutes: 15,
  gracePercent: 40,
  intervalMinutes: 45,
  maxAttempts: 2,
  operatingHours: [
    { end: '12:00', start: '07:00', weekday: 1 },
    { end: '18:00', start: '13:00', weekday: 1 },
  ],
}

type SaveCall = Parameters<DriverStopReminderSettingsPort['save']>[0]

function createFixture(permissions: CompanyContext['permissions']) {
  const saves: SaveCall[] = []
  const finds: string[] = []
  const settings: DriverStopReminderSettingsPort = {
    find: async ({ companyId }) => {
      finds.push(companyId)
      return { settings: DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS, updatedAt: null }
    },
    save: async (params) => {
      saves.push(params)
      return {
        settings: {
          dwellMinutes: params.dwellMinutes,
          enabled: params.enabled,
          graceMinMinutes: params.graceMinMinutes,
          gracePercent: params.gracePercent,
          intervalMinutes: params.intervalMinutes,
          maxAttempts: params.maxAttempts,
          operatingHours: params.operatingHours,
        },
        updatedAt: UPDATED_AT,
      }
    },
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'stop-reminder-settings-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    routes: createDriverStopReminderSettingsRoutes({
      resolveClientIp: () => '203.0.113.7',
      settings,
    }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'stop-reminder-settings-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    finds,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    saves,
  }
}

const manager = () => createFixture(new Set(['settings.manage']))

async function putFields(body: unknown): Promise<{ status: number; fields: string[] }> {
  const fixture = manager()
  const response = await fixture.handle(jsonRequest({ body, method: 'PUT', path: PATH }))
  const payload = (await response.json()) as {
    error?: { details?: readonly { field: string }[] }
  }
  expect(fixture.saves).toEqual([])
  return {
    fields: (payload.error?.details ?? []).map((detail) => detail.field),
    status: response.status,
  }
}

describe('a configuração da cobrança do motorista (spec 299 T4.2)', () => {
  test('sem `settings.manage`, GET e PUT recebem 403 e nada é lido nem gravado', async () => {
    const fixture = createFixture(new Set(['fleet.read', 'trip.manage']))
    const get = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
    const put = await fixture.handle(jsonRequest({ body: VALID_BODY, method: 'PUT', path: PATH }))
    expect([get.status, put.status]).toEqual([403, 403])
    expect(fixture.finds).toEqual([])
    expect(fixture.saves).toEqual([])
  })

  test('GET sem linha devolve os padrões, desligada, `origin` default e `updatedAt` nulo', async () => {
    const fixture = manager()
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        dwellMinutes: 30,
        enabled: false,
        graceMinMinutes: 30,
        gracePercent: 50,
        intervalMinutes: 30,
        maxAttempts: 3,
        operatingHours: [],
        origin: 'default',
        updatedAt: null,
      },
    })
    expect(fixture.finds).toEqual([COMPANY_CONTEXT.companyId])
  })

  test('PUT válido grava com a empresa e o autor do contexto e devolve o que ficou', async () => {
    const fixture = manager()
    const response = await fixture.handle(
      jsonRequest({ body: VALID_BODY, method: 'PUT', path: PATH }),
    )
    expect(response.status).toBe(200)
    expect(fixture.saves).toEqual([
      {
        ...VALID_BODY,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: expect.any(String),
        ipAddress: '203.0.113.7',
        userId: COMPANY_CONTEXT.userId,
      },
    ])
    expect(await response.json()).toEqual({
      data: { ...VALID_BODY, origin: 'company', updatedAt: UPDATED_AT.toISOString() },
    })
  })

  test('campo desconhecido (`companyId`) é recusado com 400', async () => {
    const result = await putFields({ ...VALID_BODY, companyId: crypto.randomUUID() })
    expect(result.status).toBe(400)
  })

  test('cada limite é recusado fora da faixa e aceito na borda', async () => {
    const rejected: readonly (readonly [string, unknown])[] = [
      ['maxAttempts', 0],
      ['maxAttempts', 6],
      ['intervalMinutes', 9],
      ['intervalMinutes', 121],
      ['graceMinMinutes', 4],
      ['graceMinMinutes', 241],
      ['gracePercent', -1],
      ['gracePercent', 101],
      ['dwellMinutes', 4],
      ['dwellMinutes', 241],
      ['maxAttempts', 1.5],
      ['enabled', 'true'],
    ]
    for (const [field, value] of rejected) {
      const result = await putFields({ ...VALID_BODY, [field]: value })
      expect([field, result.status, result.fields]).toEqual([field, 400, [field]])
    }
    const edges = {
      dwellMinutes: 5,
      enabled: false,
      graceMinMinutes: 240,
      gracePercent: 0,
      intervalMinutes: 120,
      maxAttempts: 5,
      operatingHours: [],
    }
    const fixture = manager()
    const response = await fixture.handle(jsonRequest({ body: edges, method: 'PUT', path: PATH }))
    expect(response.status).toBe(200)
  })

  test('campo obrigatório ausente é recusado', async () => {
    const withoutEnabled: Partial<typeof VALID_BODY> = { ...VALID_BODY }
    delete withoutEnabled.enabled
    expect((await putFields(withoutEnabled)).fields).toEqual(['enabled'])
  })

  test('faixa: dia, formato de hora e início antes do fim', async () => {
    const cases: readonly (readonly [string, object, string])[] = [
      ['weekday 7', { end: '18:00', start: '07:00', weekday: 7 }, 'operatingHours.0.weekday'],
      ['weekday -1', { end: '18:00', start: '07:00', weekday: -1 }, 'operatingHours.0.weekday'],
      ['start 7:00', { end: '18:00', start: '7:00', weekday: 1 }, 'operatingHours.0.start'],
      ['end 24:00', { end: '24:00', start: '07:00', weekday: 1 }, 'operatingHours.0.end'],
      ['end 18:60', { end: '18:60', start: '07:00', weekday: 1 }, 'operatingHours.0.end'],
      ['start = end', { end: '07:00', start: '07:00', weekday: 1 }, 'operatingHours.0.end'],
      ['start > end', { end: '07:00', start: '18:00', weekday: 1 }, 'operatingHours.0.end'],
      ['chave extra', { end: '18:00', extra: 1, start: '07:00', weekday: 1 }, 'operatingHours.0'],
    ]
    for (const [label, range, field] of cases) {
      const result = await putFields({ ...VALID_BODY, operatingHours: [range] })
      expect([label, result.status, result.fields]).toEqual([label, 400, [field]])
    }
  })

  test('faixas do mesmo dia que se sobrepõem são recusadas; encostar e outro dia valem', async () => {
    const overlap = await putFields({
      ...VALID_BODY,
      operatingHours: [
        { end: '12:00', start: '07:00', weekday: 2 },
        { end: '15:00', start: '11:59', weekday: 2 },
      ],
    })
    expect([overlap.status, overlap.fields]).toEqual([400, ['operatingHours.1.start']])

    const fixture = manager()
    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...VALID_BODY,
          operatingHours: [
            { end: '12:00', start: '07:00', weekday: 2 },
            { end: '15:00', start: '12:00', weekday: 2 },
            { end: '15:00', start: '11:00', weekday: 3 },
          ],
        },
        method: 'PUT',
        path: PATH,
      }),
    )
    expect(response.status).toBe(200)
  })

  test('no máximo três faixas por dia', async () => {
    const ranges = [0, 1, 2, 3].map((index) => ({
      end: `${String(index * 2 + 8).padStart(2, '0')}:00`,
      start: `${String(index * 2 + 7).padStart(2, '0')}:00`,
      weekday: 4,
    }))
    const result = await putFields({ ...VALID_BODY, operatingHours: ranges })
    expect([result.status, result.fields]).toEqual([400, ['operatingHours']])
  })

  test('todos os erros voltam de uma vez', async () => {
    const result = await putFields({
      dwellMinutes: 999,
      enabled: 'sim',
      graceMinMinutes: 1,
      gracePercent: 101,
      intervalMinutes: 1,
      maxAttempts: 9,
      operatingHours: [
        { end: '07:00', start: '18:00', weekday: 9 },
        { end: '12:00', start: '07:00', weekday: 2 },
        { end: '13:00', start: '11:00', weekday: 2 },
      ],
    })
    expect(result.status).toBe(400)
    expect([...result.fields].sort()).toEqual(
      [
        'dwellMinutes',
        'enabled',
        'graceMinMinutes',
        'gracePercent',
        'intervalMinutes',
        'maxAttempts',
        'operatingHours.0.end',
        'operatingHours.0.weekday',
        'operatingHours.2.start',
      ].sort(),
    )
  })
})
