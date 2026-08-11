/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O ajuste manual do cursor é a saída para o que a automação não cobre — e é também
 * a forma mais fácil de criar um bloqueio novo: NSU acima do máximo nacional cai na
 * rejeição 589, e escrita fora da empresa autenticada mistura tenants. O contrato
 * prende permissão, faixa de NSU e escopo, e exige que o salto abra a janela de uma hora.
 */
import { describe, expect, test } from 'bun:test'

import { createAdjustDistributionCursorUseCase } from '../../src/companies/application/adjust-distribution-cursor.use-case.js'
import type {
  DistributionCursorAuditPort,
  DistributionCursorRepositoryPort,
} from '../../src/companies/application/distribution-cursor.port.js'
import { createGetDistributionCursorUseCase } from '../../src/companies/application/get-distribution-cursor.use-case.js'
import { createDistributionCursorRoutes } from '../../src/companies/presentation/distribution-cursor.routes.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  BARE_CURSOR_RECORD,
  CURSOR_NOW,
  CURSOR_RESYNC_WINDOW_MS,
  createDistributionCursorAuditSpy,
  createDistributionCursorRepositorySpy,
} from '../fixtures/distribution-cursor.fixture'
import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  OTHER_COMPANY_CONTEXT,
} from '../fixtures/nfe-import-application.fixture'

const MANAGER_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['settings.manage']),
}

describe('distribution cursor route contract', () => {
  test('serves the cursor of the authenticated company', async () => {
    const repository = createDistributionCursorRepositorySpy()
    const response = await callRoute({ method: 'GET', repository: repository.port })

    expect(response.status).toBe(200)
    expect(await readData(response)).toEqual({
      consecutiveRateLimits: 2,
      environment: 'production',
      lastSkipped: {
        at: '2026-08-11T13:10:00.000Z',
        fromNsu: '000000000037702',
        toNsu: '000000000045636',
      },
      maxNsu: '000000000045700',
      nextAllowedAt: '2026-08-11T15:10:00.000Z',
      ultNsu: '000000000045636',
      updatedAt: '2026-08-11T14:10:00.000Z',
    })
    expect(repository.calls).toEqual([`find:${COMPANY_ID}`])
  })

  test('reports the untouched cursor fields as null', async () => {
    const repository = createDistributionCursorRepositorySpy(BARE_CURSOR_RECORD)
    const data = await readData(await callRoute({ method: 'GET', repository: repository.port }))

    expect(data).toMatchObject({
      consecutiveRateLimits: 0,
      lastSkipped: null,
      nextAllowedAt: null,
    })
  })

  test('requires settings.manage on both routes', () => {
    const authorization = new AuthorizationService()
    const routes = createRoutes({})

    expect(routes).toHaveLength(2)
    for (const route of routes) {
      expect(route.pathname).toBe(API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH)
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
      expect(
        forbiddenStatusOf(() =>
          authorization.authorize(
            { identity: undefined, scope: COMPANY_CONTEXT } as never,
            route.policy,
          ),
        ),
      ).toBe(403)
    }
  })

  test('jumps the cursor of the authenticated company and opens the one-hour window', async () => {
    const audit = createDistributionCursorAuditSpy()
    const repository = createDistributionCursorRepositorySpy()
    const response = await callRoute({
      audit: audit.port,
      body: { companyId: OTHER_COMPANY_CONTEXT.companyId, ultNsu: '000000000045700' },
      method: 'PUT',
      repository: repository.port,
    })

    expect(response.status).toBe(200)
    expect(repository.calls).toContain(`jump:${COMPANY_ID}:000000000045700`)
    expect(await readData(response)).toMatchObject({
      consecutiveRateLimits: 0,
      nextAllowedAt: new Date(CURSOR_NOW.getTime() + CURSOR_RESYNC_WINDOW_MS).toISOString(),
      ultNsu: '000000000045700',
    })
    expect(audit.entries).toEqual([
      {
        action: 'nfe-distribution-cursor.adjusted',
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_ID,
        correlationId: 'distribution-cursor-contract',
        fromUltNsu: '000000000045636',
        toUltNsu: '000000000045700',
      },
    ])
  })

  test('refuses an ultNsu above maxNsu without writing', async () => {
    const audit = createDistributionCursorAuditSpy()
    const repository = createDistributionCursorRepositorySpy()
    const error = await apiErrorOf(
      callRoute({
        audit: audit.port,
        body: { ultNsu: '000000000045701' },
        method: 'PUT',
        repository: repository.port,
      }),
    )

    expect(error).toMatchObject({ code: 'DISTRIBUTION_CURSOR_ABOVE_MAX_NSU', status: 422 })
    expect(repository.calls.some((call) => call.startsWith('jump:'))).toBe(false)
    expect(audit.entries).toEqual([])
  })

  test('refuses an ultNsu outside the fifteen digits without reading the cursor', async () => {
    const repository = createDistributionCursorRepositorySpy()
    const error = await apiErrorOf(
      callRoute({ body: { ultNsu: '45700' }, method: 'PUT', repository: repository.port }),
    )

    expect(error).toMatchObject({ code: 'DISTRIBUTION_CURSOR_INVALID_NSU', status: 422 })
    expect(repository.calls).toEqual([])
  })

  test('keeps the cursor of another company invisible and unwritable', async () => {
    const repository = createDistributionCursorRepositorySpy(null)
    const read = await apiErrorOf(callRoute({ method: 'GET', repository: repository.port }))
    const write = await apiErrorOf(
      callRoute({
        body: { ultNsu: '000000000045700' },
        method: 'PUT',
        repository: repository.port,
      }),
    )

    expect(read).toMatchObject({ code: 'DISTRIBUTION_CURSOR_NOT_FOUND', status: 404 })
    expect(write).toMatchObject({ code: 'DISTRIBUTION_CURSOR_NOT_FOUND', status: 404 })
    expect(repository.calls.some((call) => call.startsWith('jump:'))).toBe(false)
  })
})

type CallParams = {
  readonly audit?: DistributionCursorAuditPort
  readonly body?: unknown
  readonly method: 'GET' | 'PUT'
  readonly repository?: DistributionCursorRepositoryPort
}

function createRoutes({ audit, repository }: Omit<CallParams, 'method'>) {
  const port = repository ?? createDistributionCursorRepositorySpy().port
  return createDistributionCursorRoutes({
    adjust: createAdjustDistributionCursorUseCase({
      audit: audit ?? createDistributionCursorAuditSpy().port,
      clock: { now: () => CURSOR_NOW },
      repository: port,
    }),
    getStatus: createGetDistributionCursorUseCase({ repository: port }),
  })
}

function callRoute(params: CallParams): Promise<Response> {
  const route = createRoutes(params).find((candidate) => candidate.method === params.method)
  if (route === undefined) throw new Error(`missing ${params.method} distribution cursor route`)
  return route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT },
    correlationId: 'distribution-cursor-contract',
    pathParameters: {},
    request: new Request(`http://localhost${API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH}`, {
      ...(params.body === undefined
        ? {}
        : { body: JSON.stringify(params.body), headers: { 'content-type': 'application/json' } }),
      method: params.method,
    }),
  } as never)
}

async function readData(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { readonly data: Record<string, unknown> }
  return body.data
}

async function apiErrorOf(promise: Promise<Response>): Promise<ApiError> {
  try {
    const response = await promise
    throw new Error(`expected an ApiError, got status ${response.status}`)
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
}

function forbiddenStatusOf(authorize: () => void): number {
  try {
    authorize()
    return 200
  } catch (error) {
    return error instanceof ApiError ? error.status : 500
  }
}
