/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 T2.1. A avaliação da viagem passa a dizer, por nota, quanto rendeu e quanto gastou — e
 * isso é dinheiro: só `trip.financials` o vê, e o portal da contratante nunca. O contrato monta a
 * resposta de verdade (caso de uso real atrás da rota real) e confere por **conjunto de chaves**, de
 * modo que campo novo de custo que alguém acrescente depois reprove sozinho onde não deve aparecer.
 */
import { describe, expect, test } from 'bun:test'

import {
  readTripValuation,
  type ApplicableFreightRule,
  type TripValuationContext,
  type TripValuationDocument,
  type TripValuationPort,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { createContractorDeliveryRoutes } from '../../src/contractor-portal/presentation/contractor-delivery.routes.js'
import { createContractorOccurrenceRoutes } from '../../src/contractor-portal/presentation/contractor-occurrence.routes.js'
import type { ContractorDelivery } from '../../src/contractor-portal/application/contractor-portal.types.js'
import { COMPANY_ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  COST_BASES,
  DWELL_BASES,
  TIME_BASES,
} from '../../src/trips/domain/document-cost-apportionment.types.js'
import {
  jsonRequest,
  responseData,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

const PATH = `${TRIPS_PATH}/${TRIP_ID}/valuation`
const FINANCIALS_PERMISSION = 'trip.financials'

/** Os oito campos novos do RF1 + RF9. O `amount` da linha (o frete) já existe e fica de fora. */
const FIGURE_KEYS = [
  'costAmount',
  'costBasis',
  'legCostAmount',
  'marginAmount',
  'marginPercentage',
  'taxAmount',
  'timeBasis',
  'tripShareCostAmount',
] as const

/** Tudo que é dinheiro de avaliação: nada disto pode aparecer onde o contrato diz que não. */
const FORBIDDEN_KEYS = [
  ...FIGURE_KEYS,
  'freightAmount',
  'revenueLines',
  'totalCost',
  'totalMargin',
  'totalRevenue',
] as const

const SENTINEL_AMOUNT = '777.7777'
const MONEY_PATTERN = /^-?\d+\.\d{4}$/u
const DECIMAL_PATTERN = /^-?\d+\.\d+$/u

const FIFTY_KILOMETRES = 50_000
const ONE_HOUR = 3_600
const HALF_HOUR = 1_800

const TEN_PERCENT_RULE: ApplicableFreightRule = {
  freightRuleName: 'Regra de teste',
  freightRuleId: '00000000-0000-4000-8000-000000000b01',
  freightRuleVersionId: '00000000-0000-4000-8000-000000000b02',
  maximumAmount: '',
  minimumAmount: '',
  percentage: '0.100000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '',
  version: '1',
}

type ResponseLine = Readonly<Record<string, unknown>>

type ValuationBody = {
  readonly costParcels: readonly { readonly amount: null | string; readonly kind: string }[]
  readonly revenueLines: readonly ResponseLine[]
  readonly totalCost: string
  readonly totalMargin: string
  readonly totalRevenue: string
}

function buildDocument(index: number, stopId: null | string) {
  const suffix = String(index).padStart(2, '0')
  const document: TripValuationDocument = {
    destinationCityCode: '3550308',
    destinationState: 'SP',
    icmsAmount: '20.0000',
    issuedAt: '2026-07-22T12:00:00.000Z',
    measuredAmount: null,
    nfeDocumentId: `00000000-0000-4000-8000-0000000c01${suffix}`,
    nfeTotalAmount: '1000.0000',
    senderTaxId: '61084018000109',
    stopId,
    tripDocumentId: `00000000-0000-4000-8000-0000000d01${suffix}`,
  }
  return document
}

/** Três paradas, cinco notas (2, 2 e 1), 150 km de ida e 50 km de volta; a segunda parada espera. */
function buildContext() {
  const context: TripValuationContext = {
    distanceMeters: 200_000,
    documents: [
      buildDocument(1, 'stop-1'),
      buildDocument(2, 'stop-1'),
      buildDocument(3, 'stop-2'),
      buildDocument(4, 'stop-2'),
      buildDocument(5, 'stop-3'),
    ],
    fuelPricePerLiter: '6.0000',
    legs: [
      { distanceMetres: FIFTY_KILOMETRES, durationSeconds: ONE_HOUR },
      { distanceMetres: FIFTY_KILOMETRES, durationSeconds: ONE_HOUR },
      { distanceMetres: FIFTY_KILOMETRES, durationSeconds: ONE_HOUR },
    ],
    returnDistanceMetres: FIFTY_KILOMETRES,
    stops: [
      { dwellBasis: DWELL_BASES.measured, dwellSeconds: 0, id: 'stop-1' },
      { dwellBasis: DWELL_BASES.measured, dwellSeconds: HALF_HOUR, id: 'stop-2' },
      { dwellBasis: DWELL_BASES.measured, dwellSeconds: 0, id: 'stop-3' },
    ],
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
  }
  return context
}

const REPOSITORY: TripValuationPort = {
  findApplicableRule: () => Promise.resolve(TEN_PERCENT_RULE),
  readContext: () => Promise.resolve(buildContext()),
}

async function requestValuation(permissions: CompanyContext['permissions']) {
  const executions: object[] = []
  const fixture = await createTripHttpFixture({
    permissions,
    readValuationExecute: (input) => {
      executions.push(input)
      return readTripValuation({
        companyId: COMPANY_CONTEXT.companyId,
        repository: REPOSITORY,
        tripId: TRIP_ID,
      })
    },
  })
  const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
  return { executions, response }
}

async function readValuationBody(): Promise<ValuationBody> {
  const { response } = await requestValuation(new Set([FINANCIALS_PERMISSION]))
  expect(response.status).toBe(200)
  return (await responseData(response)) as ValuationBody
}

/** Campo ausente é falha de contrato, não zero: somar `undefined` como 0 faria a conta fechar errado. */
function sumOf(values: readonly unknown[]): number {
  return values.reduce<number>((total, value) => {
    if (typeof value !== 'string')
      throw new Error(`campo de dinheiro ausente na resposta: ${String(value)}`)
    return total + Number(value)
  }, 0)
}

function missingFigureKeys(lines: readonly ResponseLine[]): string[] {
  return FIGURE_KEYS.filter((key) => !lines.every((line) => key in line))
}

/** Toda chave de qualquer profundidade — dinheiro escondido num objeto aninhado vaza igual. */
function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)])
}

function forbiddenKeysIn(value: unknown): string[] {
  return [...new Set(collectKeys(value))]
    .filter((key) => (FORBIDDEN_KEYS as readonly string[]).includes(key))
    .sort()
}

describe('com trip.financials, cada nota diz quanto rendeu e quanto gastou (spec 232 RF1)', () => {
  test('toda linha de receita traz os oito campos novos', async () => {
    const body = await readValuationBody()

    expect(body.revenueLines).toHaveLength(5)
    expect(missingFigureKeys(body.revenueLines)).toEqual([])
  })

  test('com roteiro congelado a base é o trecho, e o dinheiro vem com quatro casas', async () => {
    const body = await readValuationBody()

    for (const line of body.revenueLines) {
      expect(line.costBasis).toBe(COST_BASES.leg)
      expect(Object.values(TIME_BASES)).toContain(line.timeBasis as never)
      for (const key of [
        'costAmount',
        'legCostAmount',
        'marginAmount',
        'taxAmount',
        'tripShareCostAmount',
      ]) {
        expect(String(line[key])).toMatch(MONEY_PATTERN)
      }
      expect(String(line.marginPercentage)).toMatch(DECIMAL_PATTERN)
    }
  })

  test('o gasto da nota é o do trecho mais o rateio da viagem', async () => {
    const body = await readValuationBody()

    for (const line of body.revenueLines) {
      expect(Number(line.legCostAmount) + Number(line.tripShareCostAmount)).toBeCloseTo(
        Number(line.costAmount),
        4,
      )
    }
  })
})

describe('a soma das notas fecha com a viagem, na resposta montada (spec 232 D4, CA01)', () => {
  /**
   * ⚠️ O `totalCost` da viagem já inclui o imposto. Se a soma só olhasse `costAmount`, ela ficaria
   * fora por todo o imposto — e nada falharia. O cenário tem ICMS de propósito: a parcela existe, é
   * positiva, e a conta que não a conta fica de fora por exatamente esse valor.
   */
  test('o cenário tem imposto no total do custo, senão a conta abaixo não provaria nada', async () => {
    const body = await readValuationBody()
    const taxTotal = sumOf(
      body.costParcels.filter((parcel) => parcel.kind === 'icms').map((parcel) => parcel.amount),
    )

    expect(taxTotal).toBeGreaterThan(0)
    expect(Number(body.totalCost)).toBeGreaterThan(taxTotal)
  })

  test('Σ (costAmount + taxAmount) é o totalCost, ao centavo', async () => {
    const body = await readValuationBody()

    const total =
      sumOf(body.revenueLines.map((line) => line.costAmount)) +
      sumOf(body.revenueLines.map((line) => line.taxAmount))

    expect(total).toBeCloseTo(Number(body.totalCost), 4)
  })

  test('o imposto por nota soma as parcelas de imposto da viagem', async () => {
    const body = await readValuationBody()
    const taxKinds = new Set(['icms', 'pis_cofins'])
    const parcelTax = sumOf(
      body.costParcels.filter((parcel) => taxKinds.has(parcel.kind)).map((parcel) => parcel.amount),
    )

    expect(sumOf(body.revenueLines.map((line) => line.taxAmount))).toBeCloseTo(parcelTax, 4)
  })

  test('Σ frete é o totalRevenue', async () => {
    const body = await readValuationBody()

    expect(sumOf(body.revenueLines.map((line) => line.amount))).toBeCloseTo(
      Number(body.totalRevenue),
      4,
    )
  })

  test('Σ marginAmount é o totalMargin', async () => {
    const body = await readValuationBody()

    expect(sumOf(body.revenueLines.map((line) => line.marginAmount))).toBeCloseTo(
      Number(body.totalMargin),
      4,
    )
  })
})

describe('sem trip.financials, nenhum campo novo aparece (spec 232 RF6, D7, CA07)', () => {
  const roles = Object.keys(COMPANY_ROLE_PERMISSIONS) as (keyof typeof COMPANY_ROLE_PERMISSIONS)[]
  const hasFinancials = (role: keyof typeof COMPANY_ROLE_PERMISSIONS) =>
    (COMPANY_ROLE_PERMISSIONS[role] as readonly string[]).includes(FINANCIALS_PERMISSION)

  /** Sem isto o laço abaixo poderia passar sem testar nada: um papel que vê e um que não vê. */
  test('o catálogo de papéis tem quem vê dinheiro e quem não vê', () => {
    expect(roles.filter(hasFinancials).length).toBeGreaterThan(0)
    expect(roles.filter((role) => !hasFinancials(role)).length).toBeGreaterThan(0)
  })

  for (const role of roles.filter((candidate) => !hasFinancials(candidate))) {
    test(`o papel ${role} é recusado, e a resposta não carrega chave de dinheiro nenhuma`, async () => {
      const { executions, response } = await requestValuation(
        new Set(COMPANY_ROLE_PERMISSIONS[role]),
      )
      const body: unknown = await response.json()

      expect(response.status).toBe(403)
      expect(executions).toEqual([])
      expect(forbiddenKeysIn(body)).toEqual([])
      expect(Object.keys(body as object)).toEqual(['error'])
    })
  }

  for (const role of roles.filter(hasFinancials)) {
    test(`o papel ${role} recebe os campos novos em toda linha`, async () => {
      const { response } = await requestValuation(new Set(COMPANY_ROLE_PERMISSIONS[role]))
      const data = (await responseData(response)) as ValuationBody

      expect(response.status).toBe(200)
      expect(data.revenueLines).not.toHaveLength(0)
      expect(missingFigureKeys(data.revenueLines)).toEqual([])
    })
  }

  test('quem só monta a viagem, sem a permissão de dinheiro, não recebe nada', async () => {
    const { executions, response } = await requestValuation(
      new Set(['fleet.read', 'trip.manage', 'trip.read']),
    )

    expect(response.status).toBe(403)
    expect(executions).toEqual([])
    expect(forbiddenKeysIn(await response.json())).toEqual([])
  })
})

describe('no portal da contratante, nunca (spec 232 D7, CA07)', () => {
  const PORTAL_PERMISSIONS = new Set(COMPANY_ROLE_PERMISSIONS.contractor)
  const PORTAL_CONTEXT: CompanyContext = {
    companyId: COMPANY_CONTEXT.companyId,
    kind: 'company',
    membershipId: '00000000-0000-4000-8000-000000000002',
    permissions: new Set(['deliveries.track'] as const),
    roles: ['contractor'],
    userId: '00000000-0000-4000-8000-000000000003',
  }

  /** Toda chave de avaliação com um valor reconhecível, para um vazamento aparecer pelo valor também. */
  const LEAKED_FIGURES = Object.fromEntries(
    FORBIDDEN_KEYS.map((key) => [key, key === 'revenueLines' ? [] : SENTINEL_AMOUNT]),
  )

  const DELIVERY: ContractorDelivery = {
    accessKey: `3526${'1'.repeat(40)}`,
    deliveredAt: null,
    documentId: '00000000-0000-4000-8000-000000000901',
    estimatedArrivalAt: '2026-08-28T13:00:00.000Z',
    issuedAt: '2026-08-27T09:00:00.000Z',
    number: '900001',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    tripStatus: 'dispatched',
  }

  async function bodyOf(response: Response) {
    const text = await response.text()
    return { data: (JSON.parse(text) as { data: readonly object[] }).data, text }
  }

  test('o papel do portal não tem trip.financials, e a rota da avaliação o recusa', async () => {
    const { executions, response } = await requestValuation(PORTAL_PERMISSIONS)

    expect(PORTAL_PERMISSIONS.has(FINANCIALS_PERMISSION as never)).toBe(false)
    expect(response.status).toBe(403)
    expect(executions).toEqual([])
  })

  test('a lista de entregas do portal é projeção fechada: dinheiro de avaliação não passa', async () => {
    const leaky: ContractorDelivery = { ...DELIVERY, ...LEAKED_FIGURES }
    const [list] = createContractorDeliveryRoutes({
      listDeliveries: { execute: () => Promise.resolve([leaky]) },
      readDeliveryLocation: { execute: () => Promise.resolve(null) },
      scheduleDelivery: { execute: () => Promise.reject(new Error('não usado')) },
    })

    const response = await list!.execute({
      context: { scope: PORTAL_CONTEXT } as never,
      pathParameters: {},
      request: new Request('http://api.test/client/me/deliveries'),
    } as never)
    const { data, text } = await bodyOf(response)

    expect(forbiddenKeysIn(data)).toEqual([])
    expect(text).not.toContain(SENTINEL_AMOUNT)
  })

  test('a lista de ocorrências do portal é projeção fechada: dinheiro de avaliação não passa', async () => {
    const leaky = {
      caseStatus: 'awaiting_contractor' as const,
      decidedAt: null,
      decisionKind: null,
      items: [],
      nfeAccessKey: '35260911222333000181550010000045121000045128',
      nfeNumber: '4512',
      nfeSeries: '1',
      note: 'caixa com avaria',
      occurrenceId: '00000000-0000-4000-8000-000000000005',
      occurrenceTypeName: 'Caixa violada',
      openedAt: '2026-09-24T10:00:00.000Z',
      stage: 'separation',
      ...LEAKED_FIGURES,
    }
    const [list] = createContractorOccurrenceRoutes({
      conversationRefs: () => Promise.resolve(new Map()),
      decideOccurrenceCase: {
        decide: () => Promise.reject(new Error('não usado')),
        list: () => Promise.resolve([leaky]),
      },
      readAttachments: () => Promise.resolve([]),
    })

    const response = await list!.execute({
      context: { scope: PORTAL_CONTEXT } as never,
      pathParameters: {},
      request: new Request('http://api.test/client/me/occurrences'),
    } as never)
    const { data, text } = await bodyOf(response)

    expect(forbiddenKeysIn(data)).toEqual([])
    expect(text).not.toContain(SENTINEL_AMOUNT)
  })
})
