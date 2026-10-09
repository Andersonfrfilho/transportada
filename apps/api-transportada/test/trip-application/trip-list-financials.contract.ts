/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259 T2.2: custo e margem da linha de `/trips` saem da única conta de margem do produto
 * (`buildValuationFromContext`), com a busca de regra memoizada, e só chegam à lista de quem pediu.
 */
import { describe, expect, test } from 'bun:test'

import { readTripListFinancials } from '../../src/trips/application/read-trip-list-financials.use-case.js'
import type {
  TripListFinancials,
  TripListFinancialsPort,
} from '../../src/trips/application/read-trip-list-financials.use-case.js'
import { TRIP_AMOUNTS_MONEY_FIELDS } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import type { TripAmounts } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import {
  buildValuationFromContext,
  type ApplicableFreightRule,
  type TripValuationContext,
  type TripValuationDocument,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import type { TripRepositoryPort } from '../../src/trips/application/trip.port.js'
import { TRIP, TRIP_ID } from '../fixtures/trip-http-payload.fixture.js'

const COMPANY_ID = 'empresa-1'
const OTHER_TRIP_ID = 'viagem-2'

const RULE: ApplicableFreightRule = {
  freightRuleId: 'regra-1',
  freightRuleName: 'Regra de bancada',
  freightRuleVersionId: 'versao-1',
  maximumAmount: '',
  minimumAmount: '',
  percentage: '0.100000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '',
  version: '1',
}

function documentOf(overrides: Partial<TripValuationDocument> = {}): TripValuationDocument {
  return {
    destinationCityCode: '3543402',
    destinationState: 'SP',
    issuedAt: '2026-08-10T06:00:00.000Z',
    measuredAmount: null,
    nfeDocumentId: 'nota-1',
    nfeTotalAmount: '1000.0000',
    senderTaxId: '11222333000181',
    tripDocumentId: 'vinculo-1',
    ...overrides,
  }
}

function contextOf(documents: readonly TripValuationDocument[]): TripValuationContext {
  return {
    distanceMeters: 100_000,
    documents,
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
  }
}

describe('custo e margem da linha de /trips (spec 259 T2.2)', () => {
  test('vêm de buildValuationFromContext: nenhuma segunda conta de margem', async () => {
    const context = contextOf([documentOf()])
    const expected = await buildValuationFromContext({
      companyId: COMPANY_ID,
      context,
      repository: { findApplicableRule: () => Promise.resolve(RULE) },
    })

    const financials = await readTripListFinancials({
      companyId: COMPANY_ID,
      repository: {
        findApplicableRule: () => Promise.resolve(RULE),
        readValuationContexts: () => Promise.resolve(new Map([[TRIP_ID, context]])),
      },
      tripIds: [TRIP_ID],
    })

    expect(financials.get(TRIP_ID)).toEqual({
      costTotal: expected.totalCost,
      hasGaps: expected.hasGaps,
      marginPercentage: expected.marginPercentage,
      marginTotal: expected.totalMargin,
    })
    expect(Number.parseFloat(expected.totalCost)).toBeGreaterThan(0)
  })

  test('memoiza a busca de regra: duas viagens, mesma nota, uma consulta', async () => {
    let ruleLookups = 0
    const repository: TripListFinancialsPort = {
      findApplicableRule: () => {
        ruleLookups += 1
        return Promise.resolve(RULE)
      },
      readValuationContexts: () =>
        Promise.resolve(
          new Map([
            [TRIP_ID, contextOf([documentOf()])],
            [OTHER_TRIP_ID, contextOf([documentOf({ tripDocumentId: 'vinculo-2' })])],
          ]),
        ),
    }

    const financials = await readTripListFinancials({
      companyId: COMPANY_ID,
      repository,
      tripIds: [TRIP_ID, OTHER_TRIP_ID],
    })

    expect(financials.size).toBe(2)
    expect(ruleLookups).toBe(1)
  })

  test('uma viagem que falha sai do mapa com aviso só de ids, e as outras seguem', async () => {
    const warnings: { readonly message: string; readonly metadata: unknown }[] = []
    const financials = await readTripListFinancials({
      companyId: COMPANY_ID,
      logger: { warn: (message, metadata) => warnings.push({ message, metadata }) },
      repository: {
        findApplicableRule: (query) =>
          query.senderTaxId === 'quebrado'
            ? Promise.reject(new TypeError('valor 1234.5600 da nota 999'))
            : Promise.resolve(RULE),
        readValuationContexts: () =>
          Promise.resolve(
            new Map([
              [TRIP_ID, contextOf([documentOf()])],
              [OTHER_TRIP_ID, contextOf([documentOf({ senderTaxId: 'quebrado' })])],
            ]),
          ),
      },
      tripIds: [TRIP_ID, OTHER_TRIP_ID],
    })

    expect([...financials.keys()]).toEqual([TRIP_ID])
    expect(warnings).toEqual([
      {
        message: 'trip.list.financials_trip_failed',
        metadata: { companyId: COMPANY_ID, errorName: 'TypeError', tripId: OTHER_TRIP_ID },
      },
    ])
    expect(JSON.stringify(warnings)).not.toContain('1234.5600')
  })

  test('as quatro chaves novas de TripAmounts estão classificadas, e só o hasGaps é seguro', () => {
    expect([...TRIP_AMOUNTS_MONEY_FIELDS].sort()).toEqual([
      'costTotal',
      'documentsTotal',
      'marginPercentage',
      'marginTotal',
      'revenueTotal',
    ])
  })
})

const AMOUNTS: TripAmounts = {
  documentsTotal: '1000.0000',
  revenueSource: 'estimated',
  revenueTotal: '100.0000',
}
const FINANCIALS: TripListFinancials = {
  costTotal: '270.0000',
  hasGaps: false,
  marginPercentage: '-170.0000',
  marginTotal: '-170.0000',
}

function listWith(input: { readonly includeFinancials?: boolean; readonly withAmounts?: boolean }) {
  const reads: object[] = []
  const repository = {
    list: () => Promise.resolve({ items: [TRIP], nextCursor: null }),
  } as unknown as TripRepositoryPort
  const useCase = createTripUseCase({
    amounts: {
      read: () => Promise.resolve(new Map(input.withAmounts === false ? [] : [[TRIP.id, AMOUNTS]])),
    },
    financials: {
      read: (query) => {
        reads.push(query)
        return Promise.resolve(new Map([[TRIP.id, FINANCIALS]]))
      },
    },
    locations: { purgeByTrip: () => Promise.resolve() },
    repository,
  })

  return {
    page: useCase.list({
      context: { companyId: COMPANY_ID, userId: 'usuario-1' },
      cursor: null,
      ...(input.includeFinancials === undefined
        ? {}
        : { includeFinancials: input.includeFinancials }),
      limit: 20,
    }),
    reads,
  }
}

describe('a lista só calcula e entrega o custo a quem pediu (spec 259 T2.2)', () => {
  test('com includeFinancials o custo e a margem entram em amounts', async () => {
    const { page, reads } = listWith({ includeFinancials: true })

    expect((await page).items[0]?.amounts).toEqual({ ...AMOUNTS, ...FINANCIALS })
    expect(reads).toEqual([{ companyId: COMPANY_ID, tripIds: [TRIP.id] }])
  })

  test('sem includeFinancials o custo nem é lido', async () => {
    const { page, reads } = listWith({})

    expect((await page).items[0]?.amounts).toEqual(AMOUNTS)
    expect(reads).toEqual([])
  })

  test('viagem sem receita calculada segue com amounts nulo', async () => {
    const { page } = listWith({ includeFinancials: true, withAmounts: false })

    expect((await page).items[0]?.amounts).toBeNull()
  })
})
