/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.3 (ADR-0094 §5): ler o perfil é `fleet.read`, gravar é `settings.manage`; o `PUT`
 * exige todas as chaves e recusa, de uma vez, todo campo inválido.
 */
import { describe, expect, test } from 'bun:test'

import type { ContractorReceivingProfileRules } from '../../src/cargo-receiving/application/contractor-receiving-profile.types.js'
import { createContractorReceivingProfileRoutes } from '../../src/cargo-receiving/presentation/contractor-receiving-profile.routes.js'
import { ContractorNotFoundError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000b01'
const PROFILE_PATH = `/contractors/${CONTRACTOR_ID}/receiving-profile`

const RULES: ContractorReceivingProfileRules = {
  arrivalReferencePattern: 'NroCarga\\s*[:=]?\\s*(\\d+)',
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: {
    contractorReference: 'Text001',
    routeName: 'RouteName',
    value: 'VALOR',
    weightKg: 'PESO TOTAL',
  },
  previewEnabled: true,
  previewSheetName: 'IMPORTAÇÃO',
  requiresDamageCheck: true,
  separationWindowHours: 24,
  weightTolerancePercent: 0,
}
const PROFILE = { ...RULES, contractorId: CONTRACTOR_ID, updatedAt: '2026-10-03T12:00:00.000Z' }

type ErrorBody = {
  readonly error: { readonly details?: readonly { readonly field: string }[] }
}

function createFixture(input: {
  readonly getResult?: () => Promise<unknown>
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: { get: unknown[]; save: unknown[] } = { get: [], save: [] }
  const routes = createContractorReceivingProfileRoutes({
    getProfile: {
      async execute(params) {
        calls.get.push(params)
        return (input.getResult === undefined ? null : await input.getResult()) as null
      },
    },
    saveProfile: {
      async execute(params) {
        calls.save.push(structuredClone(params))
        return PROFILE
      },
    },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? COMPANY_CONTEXT.permissions),
      routes,
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

async function putFields(body: unknown): Promise<{ status: number; fields: string[] }> {
  const fixture = createFixture({})
  const response = await fixture.handle(jsonRequest({ body, method: 'PUT', path: PROFILE_PATH }))
  const payload = (await response.json()) as ErrorBody
  expect(fixture.calls.save).toEqual([])
  return {
    fields: (payload.error.details ?? []).map((detail) => detail.field).sort(),
    status: response.status,
  }
}

describe('as rotas do perfil de recebimento (spec 237 T1.3)', () => {
  test('contratante sem perfil devolve data nula, com 200', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PROFILE_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
    expect(fixture.calls.get).toEqual([{ context: COMPANY_CONTEXT, contractorId: CONTRACTOR_ID }])
  })

  test('contratante de outra empresa é 404 com código estável', async () => {
    const fixture = createFixture({
      getResult: async () => {
        throw new ContractorNotFoundError()
      },
    })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PROFILE_PATH }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('CONTRACTOR_NOT_FOUND')
  })

  test('grava o perfil inteiro com a empresa e o ator do contexto', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ body: RULES, method: 'PUT', path: PROFILE_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(PROFILE)
    expect(fixture.calls.save).toEqual([
      {
        context: COMPANY_CONTEXT,
        contractorId: CONTRACTOR_ID,
        correlationId: CORRELATION_ID,
        rules: RULES,
      },
    ])
  })

  test('recusa todas as faixas inválidas de uma vez, nomeando cada campo', async () => {
    const result = await putFields({
      ...RULES,
      deliveryDeadlineBusinessDays: 61,
      matchWindowDays: 0,
      separationWindowHours: 169,
      weightTolerancePercent: 100.5,
    })

    expect(result).toEqual({
      fields: [
        'deliveryDeadlineBusinessDays',
        'matchWindowDays',
        'separationWindowHours',
        'weightTolerancePercent',
      ],
      status: 400,
    })
  })

  test('tolerância de peso com mais de duas casas e aba maior que a do Excel são recusadas', async () => {
    const result = await putFields({
      ...RULES,
      previewSheetName: 'x'.repeat(32),
      weightTolerancePercent: 1.234,
    })

    expect(result).toEqual({ fields: ['previewSheetName', 'weightTolerancePercent'], status: 400 })
  })

  /** Painel em cache que omite uma chave nova apagaria o valor sem erro (ADR-0094 §5). */
  test('chave omitida é 400, não volta ao padrão', async () => {
    const withoutPattern = Object.fromEntries(
      Object.entries(RULES).filter(([key]) => key !== 'arrivalReferencePattern'),
    )

    expect(await putFields(withoutPattern)).toEqual({
      fields: ['arrivalReferencePattern'],
      status: 400,
    })
  })

  test('chave desconhecida e companyId no corpo são recusados', async () => {
    expect((await putFields({ ...RULES, grouping: 'city' })).status).toBe(400)
    expect(
      (await putFields({ ...RULES, companyId: '00000000-0000-4000-8000-000000000b99' })).status,
    ).toBe(400)
  })

  test.each([
    ['(a+)+'],
    ['(\\d+'],
    ['NroCarga'],
    ['(\\d)\\1'],
    ['(?<=Carga)(\\d+)'],
    ['x'.repeat(201)],
  ])('padrão de carga %p é 400 no campo, sem executar', async (pattern) => {
    expect(await putFields({ ...RULES, arrivalReferencePattern: pattern })).toEqual({
      fields: ['arrivalReferencePattern'],
      status: 400,
    })
  })

  test('mapa de colunas com campo desconhecido ou coluna repetida é 400', async () => {
    const unknownField = await putFields({
      ...RULES,
      previewColumnMap: { ...RULES.previewColumnMap, nfeNumber: 'NF' },
    })
    expect(unknownField.status).toBe(400)
    expect(unknownField.fields[0]).toStartWith('previewColumnMap')

    const repeatedColumn = await putFields({
      ...RULES,
      previewColumnMap: { ...RULES.previewColumnMap, recipientName: ' valor ' },
    })
    expect(repeatedColumn).toEqual({ fields: ['previewColumnMap.recipientName'], status: 400 })
  })

  test('nome de coluna vazio ou com mais de 80 caracteres é 400', async () => {
    expect(
      await putFields({
        ...RULES,
        previewColumnMap: { ...RULES.previewColumnMap, city: ' ', state: 'x'.repeat(81) },
      }),
    ).toEqual({ fields: ['previewColumnMap.city', 'previewColumnMap.state'], status: 400 })
  })

  test('prévia ligada exige o mapa com roteiro, valor e peso', async () => {
    expect(await putFields({ ...RULES, previewColumnMap: null })).toEqual({
      fields: ['previewColumnMap'],
      status: 400,
    })
    expect(
      await putFields({ ...RULES, previewColumnMap: { routeName: 'RouteName', value: 'VALOR' } }),
    ).toEqual({ fields: ['previewColumnMap'], status: 400 })
  })

  test('prévia desligada aceita perfil só com o prazo', async () => {
    const fixture = createFixture({})
    const body = {
      ...RULES,
      arrivalReferencePattern: null,
      previewColumnMap: null,
      previewEnabled: false,
      previewSheetName: null,
      separationWindowHours: null,
    }
    const response = await fixture.handle(jsonRequest({ body, method: 'PUT', path: PROFILE_PATH }))

    expect(response.status).toBe(200)
    expect(fixture.calls.save).toHaveLength(1)
  })

  test('quem só lê a frota lê o perfil, mas não grava', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read', 'fleet.manage']) })

    expect((await fixture.handle(jsonRequest({ method: 'GET', path: PROFILE_PATH }))).status).toBe(
      200,
    )
    const refused = await fixture.handle(
      jsonRequest({ body: RULES, method: 'PUT', path: PROFILE_PATH }),
    )
    expect(refused.status).toBe(403)
    expect((await responseApiError(refused)).code).toBe('FORBIDDEN')
    expect(fixture.calls.save).toEqual([])
  })
})
