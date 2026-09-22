/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type {
  DriverAllowanceAuditEntry,
  DriverAllowanceSettings,
  DriverAllowanceSettingsPort,
} from '../../src/companies/application/driver-allowance-settings.port.js'
import {
  createClearDriverAllowanceSettingsUseCase,
  createGetDriverAllowanceSettingsUseCase,
  createSetDriverAllowanceSettingsUseCase,
} from '../../src/companies/application/driver-allowance-settings.use-case.js'
import { createDriverAllowanceSettingsRoutes } from '../../src/companies/presentation/driver-allowance-settings.routes.js'
import { parseDriverAllowanceSettingsBody } from '../../src/companies/presentation/driver-allowance-settings.schema.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import { DEFAULT_DAILY_ALLOWANCE_AMOUNT } from '../../src/trips/domain/daily-allowance.constant.js'
import { DAILY_ALLOWANCE_RATE_ORIGIN } from '../../src/trips/domain/daily-allowance.policy.js'

/**
 * Spec 143 D3 — o valor geral de diária que a empresa paga quando o motorista não tem valor
 * próprio. Sem linha é resposta válida: vale a constante do sistema, não 404.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-09-16T12:00:00.000Z')

const MANAGER_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

function body(value: unknown): Request {
  return new Request('http://api.test/company-settings/driver-allowance', {
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejection(value: unknown): Promise<ApiError> {
  try {
    await parseDriverAllowanceSettingsBody(body(value))
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected a rejection')
}

function fakePort(initial: DriverAllowanceSettings | null) {
  let stored = initial
  const audits: DriverAllowanceAuditEntry[] = []
  const writes: string[] = []
  const port: DriverAllowanceSettingsPort = {
    appendAudit: async (entry) => {
      audits.push(entry)
    },
    find: async ({ companyId }) => {
      writes.push(`find:${companyId}`)
      return stored
    },
    remove: async ({ companyId }) => {
      writes.push(`remove:${companyId}`)
      stored = null
    },
    upsert: async (input) => {
      writes.push(`upsert:${input.companyId}:${input.updatedByUserId}`)
      stored = { amount: input.amount, updatedAt: UPDATED_AT }
      return stored
    },
  }

  return { audits, port, writes }
}

function routesFor(port: DriverAllowanceSettingsPort) {
  return createDriverAllowanceSettingsRoutes({
    clear: createClearDriverAllowanceSettingsUseCase({ settings: port }),
    get: createGetDriverAllowanceSettingsUseCase({ settings: port }),
    set: createSetDriverAllowanceSettingsUseCase({ settings: port }),
  })
}

function callRoute(input: {
  readonly amount?: string
  readonly method: 'DELETE' | 'GET' | 'PUT'
  readonly port: DriverAllowanceSettingsPort
}): Promise<Response> {
  const route = routesFor(input.port).find((candidate) => candidate.method === input.method)
  if (route === undefined) throw new Error(`missing ${input.method} driver allowance route`)

  return route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT } as never,
    correlationId: 'driver-allowance-contract',
    pathParameters: {},
    request: new Request(`http://api.test${API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH}`, {
      ...(input.amount === undefined
        ? {}
        : {
            body: JSON.stringify({ amount: input.amount }),
            headers: { 'content-type': 'application/json' },
          }),
      method: input.method,
    }),
  })
}

async function readData(response: Response): Promise<Record<string, unknown>> {
  const parsed = (await response.json()) as { readonly data: Record<string, unknown> }
  return parsed.data
}

describe('driver allowance settings (spec 143 D3)', () => {
  test('the body is a positive four-decimal amount', async () => {
    expect(await parseDriverAllowanceSettingsBody(body({ amount: '180.0000' }))).toEqual({
      amount: '180.0000',
    })
  })

  test('zero is refused: the CHECK is > 0, and zero cannot reach the database as a 500', async () => {
    const error = await rejection({ amount: '0.0000' })
    expect(error.status).toBe(400)
  })

  test('a number instead of a decimal string is refused', async () => {
    const error = await rejection({ amount: 180 })
    expect(error.status).toBe(400)
  })

  test('companyId and updatedByUserId in the body are refused, never accepted', async () => {
    expect((await rejection({ amount: '180.0000', companyId: OTHER_COMPANY_ID })).status).toBe(400)
    expect((await rejection({ amount: '180.0000', updatedByUserId: USER_ID })).status).toBe(400)
  })

  test('the get use case returns null when there is no stored row', async () => {
    const { port } = fakePort(null)
    const settings = await createGetDriverAllowanceSettingsUseCase({ settings: port }).execute({
      companyId: COMPANY_ID,
    })
    expect(settings).toBeNull()
  })

  /**
   * O aceite do tasks.md fala em resposta HTTP (`GET devolve 200.0000 com origin: 'default'`), não
   * no retorno do use case — quem monta esse corpo é `jsonResponse` em `*.routes.ts`. Exercitar só o
   * use case (como o teste acima) deixaria passar despercebida a troca de `.default` por `.company`
   * ou o apagamento de `DEFAULT_DAILY_ALLOWANCE_AMOUNT` ali dentro.
   */
  test('GET without a stored row answers 200 with the system default, over HTTP', async () => {
    const { port } = fakePort(null)
    const response = await callRoute({ method: 'GET', port })

    expect(response.status).toBe(200)
    expect(await readData(response)).toEqual({
      amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT,
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
      updatedAt: null,
    })
  })

  test('PUT then GET over HTTP answer with origin company and the saved amount', async () => {
    const { port } = fakePort(null)
    const saveResponse = await callRoute({ amount: '180.0000', method: 'PUT', port })
    expect(saveResponse.status).toBe(200)
    expect(await readData(saveResponse)).toMatchObject({
      amount: '180.0000',
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company,
    })

    const readResponse = await callRoute({ method: 'GET', port })
    expect(await readData(readResponse)).toMatchObject({
      amount: '180.0000',
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company,
    })
  })

  test('DELETE then GET over HTTP reverts to the system default', async () => {
    const { port } = fakePort({ amount: '180.0000', updatedAt: UPDATED_AT })
    const clearResponse = await callRoute({ method: 'DELETE', port })
    expect(clearResponse.status).toBe(204)

    const readResponse = await callRoute({ method: 'GET', port })
    expect(await readData(readResponse)).toEqual({
      amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT,
      rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
      updatedAt: null,
    })
  })

  test('saving writes for the context company and audits before and after', async () => {
    const { audits, port, writes } = fakePort(null)
    const saved = await createSetDriverAllowanceSettingsUseCase({ settings: port }).execute({
      amount: '180.0000',
      companyId: COMPANY_ID,
      correlationId: 'corr-1',
      userId: USER_ID,
    })

    expect(saved.amount).toBe('180.0000')
    expect(writes).toContain(`upsert:${COMPANY_ID}:${USER_ID}`)
    expect(audits).toEqual([
      {
        action: 'company-driver-allowance.saved',
        actorUserId: USER_ID,
        after: '180.0000',
        before: null,
        companyId: COMPANY_ID,
        correlationId: 'corr-1',
      },
    ])
  })

  test('saving twice upserts by the primary key, never a second row', async () => {
    const { port, writes } = fakePort(null)
    const useCase = createSetDriverAllowanceSettingsUseCase({ settings: port })
    await useCase.execute({
      amount: '180.0000',
      companyId: COMPANY_ID,
      correlationId: 'corr-1',
      userId: USER_ID,
    })
    await useCase.execute({
      amount: '220.0000',
      companyId: COMPANY_ID,
      correlationId: 'corr-2',
      userId: USER_ID,
    })

    expect(writes.filter((write) => write.startsWith('upsert:')).length).toBe(2)
    expect(await port.find({ companyId: COMPANY_ID })).toMatchObject({ amount: '220.0000' })
  })

  test('clearing removes the row and audits only what existed', async () => {
    const existing = fakePort({ amount: '180.0000', updatedAt: UPDATED_AT })
    await createClearDriverAllowanceSettingsUseCase({ settings: existing.port }).execute({
      companyId: COMPANY_ID,
      correlationId: 'corr-2',
      userId: USER_ID,
    })
    expect(existing.writes).toContain(`remove:${COMPANY_ID}`)
    expect(existing.audits[0]?.action).toBe('company-driver-allowance.cleared')

    const empty = fakePort(null)
    await createClearDriverAllowanceSettingsUseCase({ settings: empty.port }).execute({
      companyId: COMPANY_ID,
      correlationId: 'corr-3',
      userId: USER_ID,
    })
    expect(empty.audits).toEqual([])
  })

  test('the three routes live under settings.manage, company scope', () => {
    const { port } = fakePort(null)
    const routes = createDriverAllowanceSettingsRoutes({
      clear: createClearDriverAllowanceSettingsUseCase({ settings: port }),
      get: createGetDriverAllowanceSettingsUseCase({ settings: port }),
      set: createSetDriverAllowanceSettingsUseCase({ settings: port }),
    })

    expect(routes.map((route) => route.method)).toEqual(['GET', 'PUT', 'DELETE'])
    for (const route of routes) {
      expect(route.pathname).toBe(API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH)
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
    expect(API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH).toBe('/company-settings/driver-allowance')
  })

  /** A empresa vem do contexto autenticado: a rota nem lê `companyId` de outro lugar. */
  test('the routes read the company from the context only', () => {
    const routes = readFileSync(
      new URL(
        '../../src/companies/presentation/driver-allowance-settings.routes.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(routes.match(/companyId: context\.scope\.companyId/g)?.length).toBe(3)
    expect(routes).not.toContain('input.companyId')
  })

  /** Isolamento: toda leitura e escrita da tabela é filtrada pelo tenant, por construção. */
  test('every repository statement is scoped by company', () => {
    const repository = readFileSync(
      new URL(
        '../../src/companies/infrastructure/drizzle-driver-allowance-settings.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const wheres = repository.match(/\.where\([^)]*\)/g) ?? []

    expect(wheres.length).toBeGreaterThanOrEqual(2)
    for (const where of wheres) expect(where).toContain('companyDriverAllowanceSettings.companyId')
    expect(repository).toContain('target: companyDriverAllowanceSettings.companyId')
    expect(repository).toContain('companyId: input.companyId')
  })
})
