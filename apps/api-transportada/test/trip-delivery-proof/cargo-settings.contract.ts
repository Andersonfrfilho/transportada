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
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  DELIVERY_PROOF_FIELD_MODES,
  readCargoRequiredCount,
  resolveProofSettingsForRecipient,
  type CompanyDeliveryProofSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  createDeliveryProofSettingsRoutes,
  type DeliveryProofSettingsDependencies,
} from '../../src/trips/presentation/delivery-proof-settings.routes.js'
import {
  companyDeliveryProofSettingsSchema,
  deliveryProofContractorOverridesSchema,
  DELIVERY_PROOF_MINIMUM_ABOVE_LIMIT_CODE as MINIMUM_ABOVE_LIMIT_CODE,
  deliveryProofOverridesSchema,
} from '../../src/trips/presentation/delivery-proof-settings.schema.js'

/**
 * Spec 220 RF01-RF03, RF06-RF08: a foto da mercadoria (`cargo`) ganha modo e mínimo próprios, e a
 * ausência dos dois — o painel anterior ao campo — preserva o gravado (precedente spec 193 D6).
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const CONTRACTOR_ID = '22222222-2222-4222-8222-222222222222'

const MANAGER_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: '33333333-3333-4333-8333-333333333333',
}

const MODES = {
  photo: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

function putRequest(body: unknown): Request {
  return new Request(`http://api.test${API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejection(
  schema: Parameters<typeof parseBody>[0],
  body: unknown,
): Promise<ApiError> {
  try {
    await parseBody(schema, putRequest(body))
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected a rejection')
}

async function acceptance(
  schema: Parameters<typeof parseBody>[0],
  body: unknown,
): Promise<unknown> {
  return parseBody(schema, putRequest(body))
}

function fakeDependencies(initial: CompanyDeliveryProofSettings) {
  let stored = initial
  const dependencies: DeliveryProofSettingsDependencies = {
    listContractorOverrides: async () => [],
    listOverrides: async () => [],
    readSettings: async () => stored,
    replaceContractorOverrides: async () => {},
    replaceOverrides: async () => {},
    saveSettings: async ({ settings }) => {
      stored = { ...stored, ...settings }
      return stored
    },
  }

  return dependencies
}

async function putThroughRoute(
  dependencies: DeliveryProofSettingsDependencies,
  body: unknown,
): Promise<Record<string, unknown>> {
  const route = createDeliveryProofSettingsRoutes(dependencies).find(
    (candidate) =>
      candidate.method === 'PUT' && candidate.pathname === API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH,
  )
  if (route === undefined) throw new Error('missing PUT delivery-proof route')

  const response = await route.execute({
    context: { identity: undefined, scope: MANAGER_CONTEXT } as never,
    correlationId: 'cargo-settings-contract',
    pathParameters: {},
    request: putRequest(body),
  })
  expect(response.status).toBe(200)
  return ((await response.json()) as { readonly data: Record<string, unknown> }).data
}

describe('cargo na configuração (spec 220 RF01, RF02, CA01)', () => {
  test('o padrão de fábrica é off com mínimo 1, na geral e no resolvido por nota', () => {
    expect(DEFAULT_DELIVERY_PROOF_SETTINGS.cargo).toBe('off')
    expect(DEFAULT_DELIVERY_PROOF_SETTINGS.cargoMinimumCount).toBe(1)
    expect(DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS.cargo).toBe('off')
    expect(
      resolveProofSettingsForRecipient({
        lookup: { general: null, overridesByTaxId: new Map() },
        recipientTaxId: '12345678000199',
      }).cargo,
    ).toBe('off')
  })

  test.each([...DELIVERY_PROOF_FIELD_MODES])('o PUT geral aceita cargo=%s', async (mode) => {
    const parsed = await acceptance(companyDeliveryProofSettingsSchema, { ...MODES, cargo: mode })

    expect(parsed).toMatchObject({ cargo: mode })
  })

  test('a exceção por destinatário e a por contratante aceitam os três modos', async () => {
    for (const mode of DELIVERY_PROOF_FIELD_MODES) {
      await acceptance(deliveryProofOverridesSchema, {
        overrides: [{ ...MODES, cargo: mode, taxId: '12345678000199' }],
      })
      await acceptance(deliveryProofContractorOverridesSchema, {
        overrides: [{ ...MODES, cargo: mode, contractorId: CONTRACTOR_ID }],
      })
    }
  })

  test('cargo ausente é aceito nas três formas', async () => {
    const general = await acceptance(companyDeliveryProofSettingsSchema, MODES)

    expect(general).not.toHaveProperty('cargo')
    await acceptance(deliveryProofOverridesSchema, {
      overrides: [{ ...MODES, taxId: '12345678000199' }],
    })
    await acceptance(deliveryProofContractorOverridesSchema, {
      overrides: [{ ...MODES, contractorId: CONTRACTOR_ID }],
    })
  })

  test('cargo fora da lista é 400 no campo', async () => {
    const error = await rejection(companyDeliveryProofSettingsSchema, { ...MODES, cargo: 'always' })

    expect(error.status).toBe(400)
    expect(error.code).toBe('INVALID_REQUEST')
    expect(error.details?.map((detail) => detail.field)).toEqual(['cargo'])
  })

  test('campo desconhecido segue recusado (.strict)', async () => {
    const error = await rejection(companyDeliveryProofSettingsSchema, { ...MODES, cargoo: 'off' })

    expect(error.status).toBe(400)
    expect(
      (
        await rejection(deliveryProofOverridesSchema, {
          overrides: [{ ...MODES, taxId: '12345678000199', unknown: 1 }],
        })
      ).status,
    ).toBe(400)
  })

  test('o PUT geral sem cargo preserva o gravado, com modo e mínimo', async () => {
    const dependencies = fakeDependencies({
      ...DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
      cargo: 'required',
      cargoMinimumCount: 3,
    })

    const data = await putThroughRoute(dependencies, MODES)

    expect(data).toMatchObject({ cargo: 'required', cargoMinimumCount: 3 })
  })

  test('o PUT geral com cargo grava modo e mínimo, e o GET os devolve', async () => {
    const dependencies = fakeDependencies(DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS)

    const data = await putThroughRoute(dependencies, {
      ...MODES,
      cargo: 'required',
      cargoMinimumCount: 2,
    })

    expect(data).toMatchObject({ cargo: 'required', cargoMinimumCount: 2 })
  })
})

describe('cargoMinimumCount (spec 220 RF06, RF08, CA01)', () => {
  test.each([1, 2, 3, 4, 5])('aceita %i', async (count) => {
    const parsed = await acceptance(companyDeliveryProofSettingsSchema, {
      ...MODES,
      cargo: 'required',
      cargoMinimumCount: count,
    })

    expect(parsed).toMatchObject({ cargoMinimumCount: count })
  })

  test('ausente é aceito', async () => {
    const parsed = await acceptance(companyDeliveryProofSettingsSchema, {
      ...MODES,
      cargo: 'required',
    })

    expect(parsed).not.toHaveProperty('cargoMinimumCount')
  })

  test('6 é recusado com o código estável de teto (spec 184 D3)', async () => {
    const error = await rejection(companyDeliveryProofSettingsSchema, {
      ...MODES,
      cargo: 'required',
      cargoMinimumCount: 6,
    })

    expect(error.status).toBe(400)
    expect(error.details).toEqual([
      { field: 'cargoMinimumCount', message: MINIMUM_ABOVE_LIMIT_CODE },
    ])
  })

  test('0, negativo e fração são recusados', async () => {
    for (const cargoMinimumCount of [0, -1, 1.5]) {
      const error = await rejection(companyDeliveryProofSettingsSchema, {
        ...MODES,
        cargo: 'required',
        cargoMinimumCount,
      })

      expect(error.status).toBe(400)
      expect(error.details?.map((detail) => detail.field)).toEqual(['cargoMinimumCount'])
    }
  })

  test('o teto vale também nas exceções', async () => {
    const byRecipient = await rejection(deliveryProofOverridesSchema, {
      overrides: [{ ...MODES, cargoMinimumCount: 6, taxId: '12345678000199' }],
    })
    const byContractor = await rejection(deliveryProofContractorOverridesSchema, {
      overrides: [{ ...MODES, cargoMinimumCount: 6, contractorId: CONTRACTOR_ID }],
    })

    expect(byRecipient.details?.[0]?.message).toBe(MINIMUM_ABOVE_LIMIT_CODE)
    expect(byContractor.details?.[0]?.message).toBe(MINIMUM_ABOVE_LIMIT_CODE)
  })

  test('só é lido quando o modo é required', () => {
    const settings = { ...DEFAULT_DELIVERY_PROOF_SETTINGS, cargoMinimumCount: 3 }

    expect(readCargoRequiredCount({ ...settings, cargo: 'required' })).toBe(3)
    expect(readCargoRequiredCount({ ...settings, cargo: 'optional' })).toBe(0)
    expect(readCargoRequiredCount({ ...settings, cargo: 'off' })).toBe(0)
  })
})
