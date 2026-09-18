/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseBody } from '../../src/http/request-parsing.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
  type CompanyDeliveryProofSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import type { DeliveryProofSettingsDependencies } from '../../src/trips/presentation/delivery-proof-settings.routes.js'
import { createDeliveryProofSettingsRoutes } from '../../src/trips/presentation/delivery-proof-settings.routes.js'
import { companyDeliveryProofSettingsSchema } from '../../src/trips/presentation/delivery-proof-settings.schema.js'

/**
 * ADR-0069 §3-5, spec 159 T4/RF7: os cinco parâmetros da nota do motorista, junto da configuração
 * geral do comprovante. A exceção por CNPJ não os carrega — só a configuração geral.
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

const MANAGER_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: '33333333-3333-4333-8333-333333333333',
}

function putRequest(body: unknown): Request {
  return new Request(`http://api.test${API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejection(body: unknown): Promise<ApiError> {
  try {
    await parseBody(companyDeliveryProofSettingsSchema, putRequest(body))
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected a rejection')
}

function fakeDependencies(initial: CompanyDeliveryProofSettings | null) {
  let stored = initial
  const dependencies: DeliveryProofSettingsDependencies = {
    listOverrides: async () => [],
    readSettings: async () => stored ?? DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
    replaceOverrides: async () => {},
    saveSettings: async ({ settings }) => {
      stored = { ...(stored ?? DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS), ...settings }
      return stored
    },
  }

  return dependencies
}

async function callRoute(input: {
  readonly body?: Partial<CompanyDeliveryProofSettings>
  readonly dependencies: DeliveryProofSettingsDependencies
  readonly method: 'GET' | 'PUT'
}): Promise<Response> {
  const routes = createDeliveryProofSettingsRoutes(input.dependencies)
  const route = routes.find(
    (candidate) =>
      candidate.method === input.method &&
      candidate.pathname === API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH,
  )
  if (route === undefined) throw new Error(`missing ${input.method} delivery-proof route`)

  return route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT } as never,
    correlationId: 'delivery-proof-settings-contract',
    pathParameters: {},
    request:
      input.body === undefined
        ? new Request(`http://api.test${API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH}`, {
            method: input.method,
          })
        : putRequest(input.body),
  })
}

async function readData(response: Response): Promise<Record<string, unknown>> {
  const parsed = (await response.json()) as { readonly data: Record<string, unknown> }
  return parsed.data
}

const VALID_BODY: CompanyDeliveryProofSettings = {
  canhotoOcrEnabled: false,
  latePenaltyPoints: 7,
  missingAfterHours: 12,
  missingPenaltyPoints: 15,
  photo: 'required',
  proofRadiusMeters: 500,
  proofWindowMinutes: 90,
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

describe('delivery proof punctuality settings (spec 159 T4, ADR-0069 §3-5)', () => {
  test('GET without a stored row answers the ADR-0069 §5 defaults', async () => {
    const response = await callRoute({ dependencies: fakeDependencies(null), method: 'GET' })

    expect(response.status).toBe(200)
    expect(await readData(response)).toEqual(DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS)
  })

  test('PUT then GET round-trips the five punctuality parameters', async () => {
    const dependencies = fakeDependencies(null)
    const putResponse = await callRoute({ body: VALID_BODY, dependencies, method: 'PUT' })
    expect(putResponse.status).toBe(200)
    expect(await readData(putResponse)).toEqual(VALID_BODY)

    const getResponse = await callRoute({ dependencies, method: 'GET' })
    expect(await readData(getResponse)).toEqual(VALID_BODY)
  })

  /**
   * Spec 159 T11 (item 6): o `PUT` que não manda os cinco parâmetros novos — o painel antigo, ou um
   * cliente que só troca o modo da foto — mantém o que estava gravado, nunca volta ao padrão.
   */
  test('PUT without the punctuality params keeps the stored ones', async () => {
    const dependencies = fakeDependencies(VALID_BODY)
    const modesOnly = {
      photo: 'optional',
      receiverDocument: 'off',
      receiverName: 'optional',
      signature: 'required',
    } as const

    const response = await callRoute({ body: modesOnly, dependencies, method: 'PUT' })

    expect(response.status).toBe(200)
    expect(await readData(response)).toEqual({ ...VALID_BODY, ...modesOnly })
  })

  test('PUT with only some punctuality params keeps the others (defaults without a row)', async () => {
    const dependencies = fakeDependencies(null)

    const response = await callRoute({
      body: {
        photo: 'required',
        proofRadiusMeters: 800,
        receiverDocument: 'off',
        receiverName: 'optional',
        signature: 'optional',
      },
      dependencies,
      method: 'PUT',
    })

    expect(await readData(response)).toEqual({
      ...DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
      photo: 'required',
      proofRadiusMeters: 800,
    })
  })

  test('proofWindowMinutes accepts 5..1440 and refuses outside', async () => {
    expect(
      await parseBody(
        companyDeliveryProofSettingsSchema,
        putRequest({ ...VALID_BODY, proofWindowMinutes: 5 }),
      ),
    ).toMatchObject({ proofWindowMinutes: 5 })
    expect(
      await parseBody(
        companyDeliveryProofSettingsSchema,
        putRequest({ ...VALID_BODY, proofWindowMinutes: 1440 }),
      ),
    ).toMatchObject({ proofWindowMinutes: 1440 })
    expect((await rejection({ ...VALID_BODY, proofWindowMinutes: 4 })).status).toBe(400)
    expect((await rejection({ ...VALID_BODY, proofWindowMinutes: 1441 })).status).toBe(400)
  })

  test('proofRadiusMeters accepts 50..5000 and refuses outside', async () => {
    expect((await rejection({ ...VALID_BODY, proofRadiusMeters: 49 })).status).toBe(400)
    expect((await rejection({ ...VALID_BODY, proofRadiusMeters: 5001 })).status).toBe(400)
  })

  test('latePenaltyPoints and missingPenaltyPoints accept 0..100 and refuse outside', async () => {
    expect((await rejection({ ...VALID_BODY, latePenaltyPoints: -1 })).status).toBe(400)
    expect((await rejection({ ...VALID_BODY, latePenaltyPoints: 101 })).status).toBe(400)
    expect((await rejection({ ...VALID_BODY, missingPenaltyPoints: -1 })).status).toBe(400)
    expect((await rejection({ ...VALID_BODY, missingPenaltyPoints: 101 })).status).toBe(400)
  })

  test('missingAfterHours accepts 1..168 and refuses outside', async () => {
    expect((await rejection({ ...VALID_BODY, missingAfterHours: 0 })).status).toBe(400)
    expect((await rejection({ ...VALID_BODY, missingAfterHours: 169 })).status).toBe(400)
  })

  test('a non-integer value is refused', async () => {
    expect((await rejection({ ...VALID_BODY, proofWindowMinutes: 60.5 })).status).toBe(400)
  })

  test('the override body still carries only the four field modes, never the punctuality params', async () => {
    const { deliveryProofOverridesSchema } = await import(
      '../../src/trips/presentation/delivery-proof-settings.schema.js'
    )
    const overrideBody = {
      overrides: [
        {
          photo: 'required',
          proofWindowMinutes: 90,
          receiverDocument: 'off',
          receiverName: 'optional',
          signature: 'optional',
          taxId: '12345678000199',
        },
      ],
    }

    expect(() => deliveryProofOverridesSchema.parse(overrideBody)).toThrow()
  })
})
