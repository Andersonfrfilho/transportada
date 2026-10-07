/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.8 (RF13, RF14): a correção (167/240) passa a editar o número do documento do cliente e os
 * valores pagos. Ausente na requisição é "mantém o gravado", nulo é "limpa", texto é "passa a valer"; o
 * valor unitário de um código que já estava na ocorrência é o COPIADO no registro (história imutável),
 * e o de um código novo sai da nota — nunca do corpo.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

import {
  assertSingleDeclaredAmountLevel,
  buildCorrectedOccurrenceLines,
  resolveCorrectedOccurrenceScalars,
  type StoredOccurrenceLineValues,
} from '../../src/trips/domain/occurrence-correction-values.policy.js'
import {
  buildOccurrenceCorrectionFingerprint,
  resolveOccurrenceCorrectionChanged,
} from '../../src/trips/domain/occurrence-correction.policy.js'
import { resolveDocumentProductPricing } from '../../src/trips/domain/occurrence-product-pricing.policy.js'
import { ApiError } from '../../src/shared/api.error.js'
import { parseCorrectOccurrenceItemsRequest } from '../../src/trips/presentation/occurrence.schema.js'

const OCCURRENCE = '00000000-0000-4000-8000-000000000001'

const PRICING = resolveDocumentProductPricing([
  { code: 'P1', commercialUnit: 'CX', ordinal: 1, quantity: '3.0000', unitValue: '19.9950' },
  { code: 'P2', commercialUnit: 'UN', ordinal: 2, quantity: '4.0000', unitValue: '57.2000' },
])

function stored(overrides: Partial<StoredOccurrenceLineValues>): StoredOccurrenceLineValues {
  return {
    code: 'P1',
    declaredAmount: null,
    quantity: '1.000',
    unit: 'CX' as StoredOccurrenceLineValues['unit'],
    unitValue: '10.0000',
    ...overrides,
  }
}

function next(code: string, quantity: string, unit: string) {
  return { code, quantity, unit } as never
}

function thrown(operation: () => unknown): ApiError | undefined {
  try {
    operation()
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error : undefined
  }
}

describe('as linhas corrigidas guardam o que o registro copiou (spec 247 T4.8)', () => {
  test('código que já estava na ocorrência mantém o valor unitário copiado, mesmo que a nota diga outro', () => {
    const [line] = buildCorrectedOccurrenceLines({
      declaredAmounts: [],
      nextItems: [next('P1', '2', 'CX')],
      pricing: PRICING,
      previousLines: [stored({ unitValue: '10.0000' })],
    })

    expect(line).toMatchObject({ code: 'P1', quantity: '2', unitValue: '10.0000' })
  })

  test('código novo leva o valor unitário da nota; o do corpo nunca entra', () => {
    const [line] = buildCorrectedOccurrenceLines({
      declaredAmounts: [],
      nextItems: [next('P2', '1', 'UN')],
      pricing: PRICING,
      previousLines: [stored({})],
    })

    expect(line).toMatchObject({ code: 'P2', declaredAmount: null, unitValue: '57.2000' })
  })

  test('valor pago ausente mantém o gravado; nulo limpa; texto passa a valer', () => {
    const previousLines = [
      stored({ code: 'P1', declaredAmount: '50.0000' }),
      stored({ code: 'P2', declaredAmount: '30.0000', unit: 'UN' as never }),
    ]
    const lines = buildCorrectedOccurrenceLines({
      declaredAmounts: [undefined, null],
      nextItems: [next('P1', '1', 'CX'), next('P2', '1', 'UN')],
      pricing: PRICING,
      previousLines,
    })

    expect(lines.map((line) => line.declaredAmount)).toEqual(['50.0000', null])

    const [set] = buildCorrectedOccurrenceLines({
      declaredAmounts: ['12.5'],
      nextItems: [next('P1', '1', 'CX')],
      pricing: PRICING,
      previousLines,
    })
    expect(set?.declaredAmount).toBe('12.5')
  })

  test('o valor pago zero vale e não é confundido com ausente', () => {
    const [line] = buildCorrectedOccurrenceLines({
      declaredAmounts: ['0'],
      nextItems: [next('P1', '1', 'CX')],
      pricing: PRICING,
      previousLines: [stored({ declaredAmount: '50.0000' })],
    })

    expect(line?.declaredAmount).toBe('0')
  })

  test('quantidade acima da soma da nota, na unidade da nota, é 400 com o campo; em outra unidade não se compara', () => {
    const error = thrown(() =>
      buildCorrectedOccurrenceLines({
        declaredAmounts: [],
        nextItems: [next('P1', '1', 'CX'), next('P2', '4.001', 'UN')],
        pricing: PRICING,
        previousLines: [],
      }),
    )

    expect(error?.status).toBe(400)
    expect(error?.code).toBe('OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT')
    expect(error?.details?.[0]?.field).toBe('items[1].quantity')
    expect(
      thrown(() =>
        buildCorrectedOccurrenceLines({
          declaredAmounts: [],
          nextItems: [next('P2', '99', 'box')],
          pricing: PRICING,
          previousLines: [],
        }),
      ),
    ).toBeUndefined()
  })

  test('linha sem quantidade (a linha inteira da nota) não tem teto a comparar', () => {
    const [line] = buildCorrectedOccurrenceLines({
      declaredAmounts: [],
      nextItems: [{ code: 'P1', quantity: null, unit: null }],
      pricing: PRICING,
      previousLines: [],
    })

    expect(line).toMatchObject({ code: 'P1', quantity: null, unit: null, unitValue: '19.9950' })
  })
})

describe('o número e o valor pago da ocorrência na correção (spec 247 T4.8)', () => {
  const previous = { declaredAmount: '50.0000', referenceNumber: 'NFD 1' }

  test('ausente mantém, nulo limpa, texto troca', () => {
    expect(resolveCorrectedOccurrenceScalars({ previous })).toMatchObject({
      declaredAmount: '50.0000',
      isChanged: false,
      referenceNumber: 'NFD 1',
    })
    expect(
      resolveCorrectedOccurrenceScalars({ declaredAmount: null, previous, referenceNumber: null }),
    ).toMatchObject({ declaredAmount: null, isChanged: true, referenceNumber: null })
    expect(resolveCorrectedOccurrenceScalars({ previous, referenceNumber: 'NFD 2' })).toMatchObject(
      { isChanged: true, referenceNumber: 'NFD 2' },
    )
  })

  test('o mesmo valor com outra escala não é mudança', () => {
    expect(resolveCorrectedOccurrenceScalars({ declaredAmount: '50', previous }).isChanged).toBe(
      false,
    )
    expect(resolveCorrectedOccurrenceScalars({ declaredAmount: '50.01', previous }).isChanged).toBe(
      true,
    )
  })

  test('valor da ocorrência e valor de linha ao mesmo tempo é 400, como no registro', () => {
    const lines = [stored({ declaredAmount: '10.0000' })]

    expect(
      thrown(() => assertSingleDeclaredAmountLevel({ declaredAmount: '5', lines }))?.status,
    ).toBe(400)
    expect(assertSingleDeclaredAmountLevel({ declaredAmount: null, lines })).toBeUndefined()
    expect(
      assertSingleDeclaredAmountLevel({
        declaredAmount: '5',
        lines: [stored({ declaredAmount: null })],
      }),
    ).toBeUndefined()
  })
})

describe('o que conta como mudança real da correção (spec 247 T4.8, spec 167 RF5)', () => {
  const base = [{ code: 'P1', declaredAmount: '50.0000', quantity: '1.000', unit: 'CX' as never }]

  test('só o valor pago da linha mudar é mudança; o mesmo valor em outra escala não', () => {
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [{ ...base[0], declaredAmount: '60' }] as never,
        previousItems: base as never,
      }),
    ).toBe(true)
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [{ ...base[0], declaredAmount: '50' }] as never,
        previousItems: base as never,
      }),
    ).toBe(false)
    expect(
      resolveOccurrenceCorrectionChanged({
        nextItems: [{ code: 'P1', quantity: '1.000', unit: 'CX' }] as never,
        previousItems: [{ code: 'P1', quantity: '1', unit: 'CX' }] as never,
      }),
    ).toBe(false)
  })
})

describe('a chave de idempotência da correção cobre os campos novos (spec 247 T4.8)', () => {
  const legacy = {
    occurrenceId: OCCURRENCE,
    productCodes: ['P1'],
    productQuantities: ['1'],
    productQuantityUnits: ['CX'],
  }

  test('sem os campos novos o fingerprint é o de sempre; com eles, outra chave', () => {
    const plain = buildOccurrenceCorrectionFingerprint(legacy)

    expect(buildOccurrenceCorrectionFingerprint({ ...legacy })).toBe(plain)
    expect(buildOccurrenceCorrectionFingerprint({ ...legacy, referenceNumber: 'NFD 1' })).not.toBe(
      plain,
    )
    expect(buildOccurrenceCorrectionFingerprint({ ...legacy, declaredAmount: null })).not.toBe(
      plain,
    )
    expect(
      buildOccurrenceCorrectionFingerprint({ ...legacy, productDeclaredAmounts: ['5'] }),
    ).not.toBe(plain)
    expect(buildOccurrenceCorrectionFingerprint({ ...legacy, referenceNumber: 'NFD 1' })).not.toBe(
      buildOccurrenceCorrectionFingerprint({ ...legacy, referenceNumber: null }),
    )
  })
})

function patch(body: unknown): Request {
  return new Request('http://localhost/trip-occurrences/x/items', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
}

describe('o corpo da correção na fronteira (spec 247 T4.8, RF14)', () => {
  test('aceita número e valores; ausente, nulo e texto saem distintos', async () => {
    const parsed = await parseCorrectOccurrenceItemsRequest(
      patch({
        declaredAmount: null,
        items: [
          { code: 'P1', declaredAmount: '50.5', quantity: '1', unit: 'CX' },
          { code: 'P2', declaredAmount: null },
          { code: 'P3' },
        ],
        referenceNumber: 'NFD 45029',
      }),
    )

    expect(parsed.productDeclaredAmounts).toEqual(['50.5', null, undefined])
    expect(parsed.referenceNumber).toBe('NFD 45029')
    expect(parsed.declaredAmount).toBeNull()
    const untouched = await parseCorrectOccurrenceItemsRequest(patch({ items: [{ code: 'P1' }] }))
    expect(untouched.referenceNumber).toBeUndefined()
    expect(untouched.declaredAmount).toBeUndefined()
  })

  test('número vazio limpa; caractere fora do conjunto, longo, valor negativo ou com três casas são 400', async () => {
    expect(
      (await parseCorrectOccurrenceItemsRequest(patch({ referenceNumber: '  ' }))).referenceNumber,
    ).toBeNull()
    for (const body of [
      { referenceNumber: 'NFD#1' },
      { referenceNumber: 'N'.repeat(31) },
      { declaredAmount: '-1' },
      { declaredAmount: '1.234' },
      { items: [{ code: 'P1', declaredAmount: '1.234' }] },
    ]) {
      const error = await parseCorrectOccurrenceItemsRequest(patch(body)).then(
        () => undefined,
        (reason: unknown) => reason,
      )
      expect(error instanceof ApiError ? error.status : undefined).toBe(400)
    }
  })

  test('preço e unidade da nota no corpo são recusados: o servidor nunca lê preço do payload', async () => {
    for (const body of [
      { items: [{ code: 'P1', unitValue: '0.01' }] },
      { items: [{ code: 'P1', quantityUnit: 'CX' }] },
      { unitValue: '0.01' },
    ]) {
      const error = await parseCorrectOccurrenceItemsRequest(patch(body)).then(
        () => undefined,
        (reason: unknown) => reason,
      )
      expect(error instanceof ApiError ? error.status : undefined).toBe(400)
    }
  })
})

type TripRouteDependencies = Parameters<typeof createTripRoutes>[0]

const COMPANY = '00000000-0000-4000-8000-0000000000c1'
const TRIP = '00000000-0000-4000-8000-0000000000a1'
const DOCUMENT = '00000000-0000-4000-8000-0000000000d1'
const ITEMS_PATH = `/trips/${TRIP}/documents/${DOCUMENT}/occurrences/${OCCURRENCE}/items`

function buildRouteFixture() {
  const calls: unknown[] = []
  const scope: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY,
      externalIdentityId: '00000000-0000-4000-8000-000000000104',
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'correction-user',
      userId: '00000000-0000-4000-8000-000000000002',
    } as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['trip.manage'] as never),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
  const dependencies = new Proxy({} as TripRouteDependencies, {
    get: (_target, property) => ({
      execute: async (input: unknown) => {
        if (property !== 'correctOccurrenceItems') throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
        calls.push(input)
        return { id: OCCURRENCE }
      },
    }),
  })
  const router = createRouter({
    authentication: { authenticate: async () => scope.identity },
    authorization: {
      authorize: (routed, policy) => new AuthorizationService().authorize(routed, policy),
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
      now: () => new Date('2026-07-20T12:00:00.000Z'),
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: createTripRoutes(dependencies).filter((route) => route.pathname.endsWith('/items')),
    tenantContext: { resolveCompany: async () => scope },
    userPictureExistence: stubUserPictureExistence(),
  })
  return { calls, router }
}

function patchItems(
  body: unknown,
): Parameters<ReturnType<typeof buildRouteFixture>['router']['handle']>[0] {
  return {
    correlationId: 'correlation-1',
    method: 'PATCH',
    pathname: ITEMS_PATH,
    request: new Request(`http://localhost${ITEMS_PATH}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: 'Bearer header.payload.signature',
        'content-type': 'application/json',
        'idempotency-key': 'correction-key-0001',
      },
      method: 'PATCH',
    }),
  }
}

describe('a rota PATCH .../items leva o número e os valores ao caso de uso (spec 247 T4.8)', () => {
  test('o corpo com número e valores chega com os três estados preservados', async () => {
    const { calls, router } = buildRouteFixture()

    const response = await router.handle(
      patchItems({
        declaredAmount: null,
        items: [{ code: 'P1', declaredAmount: '50', quantity: '1', unit: 'CX' }, { code: 'P2' }],
        referenceNumber: 'NFD 45029',
      }),
    )

    expect(response.status).toBe(200)
    expect(calls[0]).toMatchObject({
      declaredAmount: null,
      occurrenceId: OCCURRENCE,
      productCodes: ['P1', 'P2'],
      productDeclaredAmounts: ['50', undefined],
      referenceNumber: 'NFD 45029',
    })
  })

  test('preço da nota no corpo é 400 e o caso de uso nem é chamado', async () => {
    const { calls, router } = buildRouteFixture()

    const error = await router
      .handle(patchItems({ items: [{ code: 'P1', unitValue: '0.01' }] }))
      .then(
        () => undefined,
        (reason: unknown) => reason,
      )

    expect(error instanceof ApiError ? error.status : undefined).toBe(400)
    expect(calls).toEqual([])
  })
})
