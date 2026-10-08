/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../src/http/request-handler.service.js'
import type { RegisteredRouterRoute } from '../src/http/router.service.js'
import type { CompanyContext } from '../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  COMPANY_CONTEXT,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from './fixtures/freight-region-http.fixture.js'

const ROUTES_MODULE_PATH = '../src/trips/presentation/me-client-diagnostics.routes.js'
const DIAGNOSTICS_PATH = '/me/client-diagnostics'
const LOG_MESSAGE = 'driver_client_diagnostic'
const INVALID_CODE = 'CLIENT_DIAGNOSTICS_INVALID'
const OCCURRED_AT = '2026-10-07T12:00:00.000Z'
const MAX_EVENTS = 20
const SIGNED_URL = 'https://storage.example.com/bucket/object.jpg?X-Amz-Signature=abc123'
const NOTE_TEXT = 'observacao do motorista com texto livre'
const COORDINATE = '-23.5505199'
const FORBIDDEN_LOG_FRAGMENTS = [
  'X-Amz',
  'https://',
  NOTE_TEXT,
  COORDINATE,
  'latitude',
  'longitude',
]

const REPORT_PERMISSIONS: CompanyContext['permissions'] = new Set(['trip.report'] as const)
const NO_PERMISSIONS: CompanyContext['permissions'] = new Set()

type LogCall = { readonly message: string; readonly metadata: Record<string, unknown> | undefined }
type RoutesFactory = {
  createMeClientDiagnosticsRoutes(dependencies: {
    readonly logger: {
      error(message: string, metadata?: Record<string, unknown>): void
      info(message: string, metadata?: Record<string, unknown>): void
      warn(message: string, metadata?: Record<string, unknown>): void
    }
  }): readonly RegisteredRouterRoute[]
}

const VALID_EVENT = {
  attachmentKey: 'attachment-key-1',
  attempt: 3,
  eventKind: 'send_failed',
  failureKind: 'network',
  idempotencyKey: '00000000-0000-4000-8000-000000000301',
  occurredAt: OCCURRED_AT,
  photoBytes: 482_113,
  reportKind: 'occurrence',
  step: 'upload_put',
} as const

const TIMING_EVENT = {
  durationMs: 1_840,
  eventKind: 'step_timing',
  occurredAt: OCCURRED_AT,
  step: 'baixa_total',
} as const

const DEVICE = {
  appVersion: '1.0.0',
  deviceMemoryGb: 2,
  effectiveType: '3g',
  hardwareConcurrency: 4,
  isStandalone: true,
  saveData: false,
} as const

async function buildHarness(permissions: CompanyContext['permissions'] = REPORT_PERMISSIONS) {
  const logs: LogCall[] = []
  const logger = {
    error: () => {},
    info: (message: string, metadata?: Record<string, unknown>) => {
      logs.push({ message, metadata })
    },
    warn: () => {},
  }
  const module = (await import(ROUTES_MODULE_PATH)) as RoutesFactory
  const routes = module.createMeClientDiagnosticsRoutes({ logger })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(permissions), routes }),
  })

  return {
    diagnosticLogs: () => logs.filter((entry) => entry.message === LOG_MESSAGE),
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    routes,
  }
}

function post(body: unknown): Request {
  return jsonRequest({ body, method: 'POST', path: DIAGNOSTICS_PATH })
}

async function errorOf(response: Response) {
  return (await response.json()) as {
    readonly error: {
      readonly code: string
      readonly details?: readonly { readonly field: string; readonly message: string }[]
    }
  }
}

describe('rota de diagnóstico do cliente do motorista (spec 254 RF6/RF7)', () => {
  test('corpo válido responde 204 e grava um log por evento', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(
      post({ device: DEVICE, events: [VALID_EVENT, TIMING_EVENT] }),
    )

    expect(response.status).toBe(204)
    const logs = harness.diagnosticLogs()
    expect(logs).toHaveLength(2)
    expect(logs[0]?.metadata).toMatchObject({
      attempt: 3,
      companyId: COMPANY_CONTEXT.companyId,
      eventKind: 'send_failed',
      failureKind: 'network',
      membershipId: COMPANY_CONTEXT.membershipId,
      step: 'upload_put',
    })
    expect(logs[1]?.metadata).toMatchObject({ durationMs: 1_840, step: 'baixa_total' })
  })

  test('o companyId do corpo é recusado, e o do log vem do contexto autenticado', async () => {
    const harness = await buildHarness()
    const otherCompanyId = '00000000-0000-4000-8000-000000000999'

    const response = await harness.handle(
      post({ companyId: otherCompanyId, events: [VALID_EVENT] }),
    )

    expect(response.status).toBe(400)
    expect((await errorOf(response)).error.code).toBe(INVALID_CODE)
    expect(harness.diagnosticLogs()).toHaveLength(0)
  })

  test('campo extra no evento responde 400 com o código estável', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(post({ events: [{ ...VALID_EVENT, note: NOTE_TEXT }] }))

    expect(response.status).toBe(400)
    expect((await errorOf(response)).error.code).toBe(INVALID_CODE)
    expect(harness.diagnosticLogs()).toHaveLength(0)
  })

  test('devolve todos os erros de validação juntos em error.details', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(
      post({
        events: [
          { ...VALID_EVENT, step: 'not_a_step' },
          { ...VALID_EVENT, httpStatus: 42, durationMs: -1 },
        ],
      }),
    )

    expect(response.status).toBe(400)
    const { error } = await errorOf(response)
    expect(error.code).toBe(INVALID_CODE)
    const fields = (error.details ?? []).map((detail) => detail.field)
    expect(fields.length).toBeGreaterThanOrEqual(3)
    expect(fields.some((field) => field.includes('step'))).toBe(true)
    expect(fields.some((field) => field.includes('httpStatus'))).toBe(true)
    expect(fields.some((field) => field.includes('durationMs'))).toBe(true)
    for (const detail of error.details ?? []) expect(detail.message.length).toBeGreaterThan(0)
  })

  test('aceita de 1 a 20 eventos e recusa 0 e 21', async () => {
    const harness = await buildHarness()
    const events = (count: number) => Array.from({ length: count }, () => TIMING_EVENT)

    expect((await harness.handle(post({ events: events(MAX_EVENTS) }))).status).toBe(204)
    expect((await harness.handle(post({ events: events(MAX_EVENTS + 1) }))).status).toBe(400)
    expect((await harness.handle(post({ events: events(0) }))).status).toBe(400)
  })

  test('sem a permissão trip.report responde 403 e não grava', async () => {
    const harness = await buildHarness(NO_PERMISSIONS)

    const response = await harness.handle(post({ events: [VALID_EVENT] }))

    expect(response.status).toBe(403)
    expect(harness.diagnosticLogs()).toHaveLength(0)
  })

  test('declara o teto C5 de 6 requisições por minuto, no balde do Postgres', async () => {
    const harness = await buildHarness()
    const route = harness.routes.find(
      (candidate) => candidate.method === 'POST' && candidate.pathname === DIAGNOSTICS_PATH,
    )

    expect(route).toBeDefined()
    expect(route?.rateLimit).toMatchObject({ maxRequests: 6, windowSeconds: 60 })
  })

  test('o log não carrega URL assinada, texto de observação nem coordenada (CA2)', async () => {
    const harness = await buildHarness()
    const attempt = await harness.handle(
      post({
        device: DEVICE,
        events: [{ ...VALID_EVENT, attachmentKey: 'attachment-key-1' }, TIMING_EVENT],
      }),
    )
    expect(attempt.status).toBe(204)

    const serialized = JSON.stringify(harness.diagnosticLogs())
    expect(serialized).toContain('upload_put')
    for (const fragment of FORBIDDEN_LOG_FRAGMENTS) expect(serialized).not.toContain(fragment)
    expect(serialized).not.toContain(SIGNED_URL)
  })

  test('um campo com URL assinada é recusado antes de chegar ao log', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(
      post({ events: [{ ...VALID_EVENT, uploadUrl: SIGNED_URL, latitude: COORDINATE }] }),
    )

    expect(response.status).toBe(400)
    expect(JSON.stringify(harness.diagnosticLogs())).not.toContain(SIGNED_URL)
  })
})
