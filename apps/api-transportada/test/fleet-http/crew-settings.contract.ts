/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A diária geral do ajudante (spec 149 D2): GET nunca falha por falta de linha — devolve
 * `helperDailyRate: null`, nunca 404 — e PUT é upsert idempotente. `fleet.read`/`fleet.manage`,
 * não `settings.manage`: é a frota que lê e parametriza o valor, não configuração geral da conta.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CrewSettings,
  CrewSettingsPort,
} from '../../src/fleet/application/crew-settings.port.js'
import {
  createGetCrewSettingsUseCase,
  createSetCrewSettingsUseCase,
} from '../../src/fleet/application/crew-settings.use-case.js'
import { createCompanyCrewSettingsRoutes } from '../../src/fleet/presentation/crew-settings.routes.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_CREW_SETTINGS_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000010'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000020'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000030'
const USER_ID = '00000000-0000-4000-8000-000000000040'

const READ_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: MEMBERSHIP_ID,
  permissions: new Set(['fleet.read']),
  roles: ['operator'],
  userId: USER_ID,
}

const MANAGE_CONTEXT: CompanyContext = { ...READ_CONTEXT, permissions: new Set(['fleet.manage']) }

function createRepositorySpy(seed?: Record<string, string | null>): {
  readonly calls: string[]
  readonly port: CrewSettingsPort
  readonly store: Map<string, string | null>
} {
  const store = new Map<string, string | null>(Object.entries(seed ?? {}))
  const calls: string[] = []
  const port: CrewSettingsPort = {
    async load({ companyId }) {
      calls.push(`load:${companyId}`)
      return { helperDailyRate: store.get(companyId) ?? null }
    },
    async save({ companyId, helperDailyRate }) {
      calls.push(`save:${companyId}:${helperDailyRate ?? 'null'}`)
      store.set(companyId, helperDailyRate)
    },
  }
  return { calls, port, store }
}

function createRoutes(port: CrewSettingsPort) {
  return createCompanyCrewSettingsRoutes({
    get: createGetCrewSettingsUseCase({ crewSettings: port }),
    set: createSetCrewSettingsUseCase({ crewSettings: port }),
  })
}

function callRoute(params: {
  readonly body?: unknown
  readonly context: CompanyContext
  readonly method: 'GET' | 'PUT'
  readonly port: CrewSettingsPort
}): Promise<Response> {
  const route = createRoutes(params.port).find((candidate) => candidate.method === params.method)
  if (route === undefined) throw new Error(`missing ${params.method} company-crew-settings route`)
  return route.execute({
    context: { identity: undefined, scope: params.context },
    correlationId: 'crew-settings-contract',
    pathParameters: {},
    request: new Request(`http://localhost${API_COMPANY_CREW_SETTINGS_PATH}`, {
      ...(params.body === undefined
        ? {}
        : { body: JSON.stringify(params.body), headers: { 'content-type': 'application/json' } }),
      method: params.method,
    }),
  } as never)
}

async function readData(response: Response): Promise<CrewSettings> {
  const body = (await response.json()) as { readonly data: CrewSettings }
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

describe('company crew settings route contract', () => {
  test('requires fleet.read on GET and fleet.manage on PUT', () => {
    const authorization = new AuthorizationService()
    const routes = createRoutes(createRepositorySpy().port)
    const getRoute = routes.find((route) => route.method === 'GET')
    const putRoute = routes.find((route) => route.method === 'PUT')

    expect(routes).toHaveLength(2)
    expect(getRoute?.pathname).toBe(API_COMPANY_CREW_SETTINGS_PATH)
    expect(putRoute?.pathname).toBe(API_COMPANY_CREW_SETTINGS_PATH)
    expect(getRoute?.policy).toEqual({ permission: 'fleet.read', scope: 'company' })
    expect(putRoute?.policy).toEqual({ permission: 'fleet.manage', scope: 'company' })

    // fleet.read não sobe a diária: só quem administra a frota parametriza
    expect(() =>
      authorization.authorize(
        { identity: undefined, scope: READ_CONTEXT } as never,
        putRoute?.policy,
      ),
    ).toThrow(ApiError)
    expect(() =>
      authorization.authorize(
        { identity: undefined, scope: MANAGE_CONTEXT } as never,
        getRoute?.policy,
      ),
    ).toThrow(ApiError)
  })

  test('a company without a row reads null, not 404', async () => {
    const repository = createRepositorySpy()
    const response = await callRoute({
      context: READ_CONTEXT,
      method: 'GET',
      port: repository.port,
    })

    expect(response.status).toBe(200)
    expect(await readData(response)).toEqual({ helperDailyRate: null })
    expect(repository.calls).toEqual([`load:${COMPANY_ID}`])
  })

  test('put is idempotent and the next get reflects it', async () => {
    const repository = createRepositorySpy()
    const putResponse = await callRoute({
      body: { helperDailyRate: '150.0000' },
      context: MANAGE_CONTEXT,
      method: 'PUT',
      port: repository.port,
    })
    const getResponse = await callRoute({
      context: READ_CONTEXT,
      method: 'GET',
      port: repository.port,
    })

    expect(putResponse.status).toBe(200)
    expect(await readData(putResponse)).toEqual({ helperDailyRate: '150.0000' })
    expect(await readData(getResponse)).toEqual({ helperDailyRate: '150.0000' })

    // repetir o mesmo PUT é no-op observável: o resultado não muda
    const secondPut = await callRoute({
      body: { helperDailyRate: '150.0000' },
      context: MANAGE_CONTEXT,
      method: 'PUT',
      port: repository.port,
    })
    expect(await readData(secondPut)).toEqual({ helperDailyRate: '150.0000' })
  })

  test('clears the rate back to null through the same idempotent PUT', async () => {
    const repository = createRepositorySpy({ [COMPANY_ID]: '150.0000' })
    const response = await callRoute({
      body: { helperDailyRate: null },
      context: MANAGE_CONTEXT,
      method: 'PUT',
      port: repository.port,
    })

    expect(await readData(response)).toEqual({ helperDailyRate: null })
  })

  test('refuses a negative rate before touching the repository', async () => {
    const repository = createRepositorySpy()
    const error = await apiErrorOf(
      callRoute({
        body: { helperDailyRate: '-1.0000' },
        context: MANAGE_CONTEXT,
        method: 'PUT',
        port: repository.port,
      }),
    )

    expect(error).toMatchObject({ code: 'INVALID_REQUEST', status: 400 })
    expect(repository.calls).toEqual([])
  })

  test('refuses a rate without the four decimal places before touching the repository', async () => {
    const repository = createRepositorySpy()
    const error = await apiErrorOf(
      callRoute({
        body: { helperDailyRate: '150' },
        context: MANAGE_CONTEXT,
        method: 'PUT',
        port: repository.port,
      }),
    )

    expect(error).toMatchObject({ code: 'INVALID_REQUEST', status: 400 })
    expect(repository.calls).toEqual([])
  })

  test('keeps the setting of another company invisible and unwritable', async () => {
    const repository = createRepositorySpy({ [OTHER_COMPANY_ID]: '999.0000' })
    const read = await callRoute({ context: READ_CONTEXT, method: 'GET', port: repository.port })
    await callRoute({
      body: { helperDailyRate: '10.0000' },
      context: MANAGE_CONTEXT,
      method: 'PUT',
      port: repository.port,
    })

    expect(await readData(read)).toEqual({ helperDailyRate: null })
    expect(repository.store.get(OTHER_COMPANY_ID)).toBe('999.0000')
    expect(repository.store.get(COMPANY_ID)).toBe('10.0000')
  })
})
