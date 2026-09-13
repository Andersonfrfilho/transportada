/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type { SuggestionValuation } from '@/modules/routing/shared/suggestionValuation.service'
import type {
  TripValuation,
  TripValuationCostParcel,
} from '@/modules/trip-financials/shared/tripValuation.service'
import { buildProposalVehicleViews, STAGE_GAPS } from '@/modules/trip/shared/proposalView.service'
import type { ProposalStop } from '@/modules/trip/shared/trip.types'

/**
 * A sugestão nunca sabe o pedágio: ele só é calculado depois da viagem criada. Toda proposta saía
 * com "conta incompleta", e a marca deixou de dizer qualquer coisa. "Sem pedágio" é o que falta ali;
 * "conta incompleta" fica para o que o operador pode cadastrar.
 */
const API_POLICY = '../../../api-transportada/src/trips/domain/trip-valuation.policy.ts'
const ROW = '../../src/modules/trip/components/TripProposalRow.component.tsx'
const LOCALE = '../../src/modules/trip/locales/trip.locale.json'
const EN_LOCALE = '../../src/modules/trip/locales/trip.en.locale.json'

type ProposalLocale = Readonly<{ proposal: Readonly<Record<string, string>> }>

function apiStageGaps(): readonly string[] {
  const source = readFileSync(new URL(API_POLICY, import.meta.url), 'utf8')
  const gaps = source.slice(source.indexOf('export const VALUATION_GAPS'))
  const names = new Map(
    [...gaps.matchAll(/^\s+(\w+): '([A-Z_]+)',$/gm)].map((match) => [match[1], match[2]]),
  )
  const block = source.slice(source.indexOf('export const STAGE_GAPS'))
  const start = block.indexOf('= [')
  const list = block.slice(start, block.indexOf(']', start))

  return [...list.matchAll(/VALUATION_GAPS\.(\w+)/g)].map((match) => names.get(match[1]) ?? '')
}

function parcel(overrides: Partial<TripValuationCostParcel>): TripValuationCostParcel {
  return {
    amount: '100.0000',
    basis: null,
    detail: null,
    gap: null,
    kind: 'fuel',
    source: 'estimated',
    ...overrides,
  }
}

const TOLL_IN_SUGGESTION = parcel({
  amount: '0.0000',
  gap: 'TOLL_NOT_AVAILABLE_IN_SUGGESTION',
  kind: 'toll',
  source: 'missing',
})

function valuationWith(costParcels: readonly TripValuationCostParcel[]): SuggestionValuation {
  const valuation: TripValuation = {
    costParcels,
    hasGaps: costParcels.some((entry) => entry.gap !== null),
    marginPercentage: '50.0000',
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '100.0000',
    totalMargin: '100.0000',
    totalRevenue: '200.0000',
  }
  return {
    report: {
      gaps: [],
      hasGaps: valuation.hasGaps,
      totalCost: '100.0000',
      totalDistanceMeters: null,
      totalDurationSeconds: null,
      totalMargin: '100.0000',
      totalRevenue: '200.0000',
    },
    vehicles: [
      {
        distanceMeters: 1000,
        documentCount: 1,
        driverId: null,
        durationSeconds: 60,
        stopCount: 1,
        valuation,
        vehicleId: 'v-1',
      },
    ],
  }
}

const STOP: ProposalStop = {
  distanceFromPreviousMeters: null,
  durationFromPreviousSeconds: null,
  estimatedArrivalAt: null,
  excludedFromOptimization: false,
  geocodingPrecision: null,
  label: 'Franca',
  nfeDocumentIds: ['doc-1'],
  sequence: 1,
  vehicleId: 'v-1',
}

function viewOf(costParcels: readonly TripValuationCostParcel[]) {
  const [view] = buildProposalVehicleViews({
    documentsById: new Map(),
    driverIdByVehicleId: new Map(),
    driverNameById: new Map(),
    stops: [STOP],
    valuation: valuationWith(costParcels),
    vehicleById: new Map(),
  })
  return view
}

describe('proposta sem pedágio', () => {
  test('a lista de etapa é cópia por valor da API', () => {
    expect(apiStageGaps()).toEqual(['TOLL_NOT_AVAILABLE_IN_SUGGESTION'])
    expect([...STAGE_GAPS]).toEqual([...apiStageGaps()])
  })

  test('só falta o pedágio: "sem pedágio", nunca "conta incompleta"', () => {
    const view = viewOf([parcel({}), TOLL_IN_SUGGESTION])

    expect(view?.isTollPending).toBe(true)
    expect(view?.hasGaps).toBe(false)
  })

  test('falta motorista além do pedágio: a conta continua incompleta', () => {
    const view = viewOf([
      parcel({ amount: '0.0000', gap: 'NO_DRIVER_RATE', kind: 'driver', source: 'missing' }),
      TOLL_IN_SUGGESTION,
    ])

    expect(view?.hasGaps).toBe(true)
    expect(view?.isTollPending).toBe(false)
  })

  test('conta completa: nem uma marca nem outra', () => {
    const view = viewOf([parcel({})])

    expect(view?.hasGaps).toBe(false)
    expect(view?.isTollPending).toBe(false)
  })

  test('a linha imprime o rótulo próprio, com texto nas duas línguas', () => {
    const row = readFileSync(new URL(ROW, import.meta.url), 'utf8')
    const locale = JSON.parse(
      readFileSync(new URL(LOCALE, import.meta.url), 'utf8'),
    ) as ProposalLocale
    const english = JSON.parse(
      readFileSync(new URL(EN_LOCALE, import.meta.url), 'utf8'),
    ) as ProposalLocale

    expect(row).toContain("t('proposal.withoutToll')")
    expect(locale.proposal.withoutToll).toBe('sem pedágio')
    expect(english.proposal.withoutToll).toBe('without toll')
  })
})
