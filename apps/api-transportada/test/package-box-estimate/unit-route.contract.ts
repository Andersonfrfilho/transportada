/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF08 + P1 (T008) — a rota que informa a unidade e a fila expondo `unit`, `estimate` e
 * `isEstimated`.
 */
import { describe, expect, test } from 'bun:test'

import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type {
  RecordPackageBoxUnit,
  RecordPackageBoxUnitInput,
} from '../../src/nfe-documents/application/record-package-box-unit.use-case.js'
import { toPackageBoxUnitFields } from '../../src/nfe-documents/infrastructure/package-box-unit.mapper.js'
import { createPackageBoxRoutes } from '../../src/nfe-documents/presentation/package-box.routes.js'
import { parsePackageBoxUnit } from '../../src/nfe-documents/presentation/package-box.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const BOX_ID = '00000000-0000-4000-8000-0000000000b1'

function unusedDependency(): never {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => {
      throw new Error('não chamado')
    },
    get: () => unusedDependency(),
  }
  return new Proxy(() => undefined, handler) as never
}

function companyContext(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-0000000000a2',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'conferente',
      userId: '00000000-0000-4000-8000-0000000000a1',
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-0000000000a3',
      permissions: new Set(['cargo.measure']),
      roles: ['separator'],
      userId: '00000000-0000-4000-8000-0000000000a1',
    },
  }
}

function buildUnitRoute(recordPackageBoxUnit: RecordPackageBoxUnit) {
  const routes = createPackageBoxRoutes({
    cameraMeasurementSettings: unusedDependency(),
    exportPendingPackageBoxes: unusedDependency(),
    listPackageBoxes: unusedDependency(),
    listPackageBoxSiblings: unusedDependency(),
    measurePackageBox: unusedDependency(),
    recordPackageBoxUnit,
    replicatePackageBoxMeasurement: unusedDependency(),
  })
  const route = routes.find(
    (candidate) =>
      candidate.method === 'PUT' && candidate.pathname === '/nfe-package-boxes/:id/unit',
  )
  if (route === undefined) throw new Error('rota da unidade ausente')
  return route
}

function unitRequest(body: unknown): Request {
  return new Request(`https://api.test/nfe-package-boxes/${BOX_ID}/unit`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('PUT /nfe-package-boxes/:id/unit (spec 163, T008)', () => {
  test('pede cargo.measure no escopo da empresa', () => {
    const route = buildUnitRoute(unusedDependency())
    expect(route.policy).toEqual({ permission: 'cargo.measure', scope: 'company' })
  })

  test('grava como typed, com a empresa do contexto, e devolve a estimativa', async () => {
    const received: RecordPackageBoxUnitInput[] = []
    const route = buildUnitRoute({
      async execute(input) {
        received.push(input)
        return {
          estimate: {
            arrangement: '2x2x6',
            grossWeightGrams: 2142,
            heightMm: 128,
            lengthMm: 188,
            volumeCm3: 4524,
            widthMm: 188,
          },
        }
      },
    })

    const response = await route.execute({
      context: companyContext(),
      correlationId: 'correlation-163',
      pathParameters: { id: BOX_ID },
      request: unitRequest({ grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        estimate: {
          arrangement: '2x2x6',
          grossWeightGrams: 2142,
          heightMm: 128,
          lengthMm: 188,
          volumeCm3: 4524,
          widthMm: 188,
        },
      },
    })
    expect(received).toEqual([
      {
        boxId: BOX_ID,
        context: { companyId: COMPANY_ID },
        source: 'typed',
        unit: { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 },
      },
    ])
  })

  test('sem estimativa, devolve estimate null', async () => {
    const route = buildUnitRoute({ execute: async () => ({ estimate: undefined }) })
    const response = await route.execute({
      context: companyContext(),
      correlationId: 'correlation-163',
      pathParameters: { id: BOX_ID },
      request: unitRequest({ heightMm: 30, lengthMm: 60, unitsPerBox: 1, widthMm: 90 }),
    })
    expect(await response.json()).toEqual({ data: { estimate: null } })
  })
})

describe('parsePackageBoxUnit (spec 163, T008)', () => {
  test('aceita as três arestas, peso e unidades por caixa opcionais', () => {
    expect(
      parsePackageBoxUnit({
        grossWeightGrams: 85,
        heightMm: 30,
        lengthMm: 60,
        unitsPerBox: 24,
        widthMm: 90,
      }),
    ).toEqual({
      unit: { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 },
      unitsPerBox: 24,
    })
  })

  test('companyId, source ou medida da caixa no corpo são recusados (strict)', () => {
    const unit = { heightMm: 30, lengthMm: 60, widthMm: 90 }
    expect(() => parsePackageBoxUnit({ ...unit, companyId: COMPANY_ID })).toThrow()
    expect(() => parsePackageBoxUnit({ ...unit, source: 'catalog' })).toThrow()
    expect(() => parsePackageBoxUnit({ ...unit, measurementSource: 'typed' })).toThrow()
  })

  test('aresta ausente, não inteira ou não positiva é recusada', () => {
    expect(() => parsePackageBoxUnit({ heightMm: 30, lengthMm: 60 })).toThrow()
    expect(() => parsePackageBoxUnit({ heightMm: 30.5, lengthMm: 60, widthMm: 90 })).toThrow()
    expect(() => parsePackageBoxUnit({ heightMm: 0, lengthMm: 60, widthMm: 90 })).toThrow()
  })
})

describe('toPackageBoxUnitFields — a fila expõe unit, estimate e isEstimated (RF08)', () => {
  const EMPTY = {
    estimatedArrangement: null,
    estimatedAt: null,
    estimatedGrossWeightGrams: null,
    estimatedHeightMm: null,
    estimatedLengthMm: null,
    estimatedVolumeCm3: null,
    estimatedWidthMm: null,
    lengthMm: null,
    unitGrossWeightGrams: null,
    unitHeightMm: null,
    unitLengthMm: null,
    unitMeasurementSource: null,
    unitWidthMm: null,
  }
  const WITH_UNIT_AND_ESTIMATE = {
    ...EMPTY,
    estimatedArrangement: '2x2x6',
    estimatedAt: new Date('2026-09-22T12:00:00.000Z'),
    estimatedGrossWeightGrams: 2142,
    estimatedHeightMm: 128,
    estimatedLengthMm: 188,
    estimatedVolumeCm3: 4524,
    estimatedWidthMm: 188,
    unitGrossWeightGrams: 85,
    unitHeightMm: 30,
    unitLengthMm: 60,
    unitMeasurementSource: 'typed',
    unitWidthMm: 90,
  }

  test('caixa sem nada: unit e estimate nulos, isEstimated falso', () => {
    expect(toPackageBoxUnitFields(EMPTY)).toEqual({
      estimate: null,
      isEstimated: false,
      unit: null,
    })
  })

  test('só estimativa: isEstimated verdadeiro', () => {
    expect(toPackageBoxUnitFields(WITH_UNIT_AND_ESTIMATE)).toEqual({
      estimate: {
        arrangement: '2x2x6',
        estimatedAt: '2026-09-22T12:00:00.000Z',
        grossWeightGrams: 2142,
        heightMm: 128,
        lengthMm: 188,
        volumeCm3: 4524,
        widthMm: 188,
      },
      isEstimated: true,
      unit: { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, source: 'typed', widthMm: 90 },
    })
  })

  test('com medida real a estimativa continua visível, mas isEstimated é falso', () => {
    const fields = toPackageBoxUnitFields({ ...WITH_UNIT_AND_ESTIMATE, lengthMm: 190 })
    expect(fields.isEstimated).toBe(false)
    expect(fields.estimate?.arrangement).toBe('2x2x6')
  })
})
