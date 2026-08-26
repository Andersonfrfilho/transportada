/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  readTripValuation,
  type ApplicableFreightRule,
  type TripValuationContext,
  type TripValuationDocument,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'

const TEN_PERCENT_RULE: ApplicableFreightRule = {
  freightRuleId: '00000000-0000-4000-8000-000000000b01',
  freightRuleVersionId: '00000000-0000-4000-8000-000000000b02',
  maximumAmount: '',
  minimumAmount: '',
  percentage: '0.100000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '',
  version: '1',
}

function document(overrides: Partial<TripValuationDocument> = {}): TripValuationDocument {
  return {
    destinationCityCode: '3550308',
    destinationState: 'SP',
    issuedAt: '2026-07-22T12:00:00.000Z',
    measuredAmount: null,
    nfeDocumentId: '00000000-0000-4000-8000-000000000c01',
    nfeTotalAmount: '1000.0000',
    senderTaxId: '61084018000109',
    tripDocumentId: '00000000-0000-4000-8000-000000000d01',
    ...overrides,
  }
}

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: 200_000,
    documents: [document()],
    fuelPricePerLiter: '6.0000',
    vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
    ...overrides,
  }
}

function run(input: {
  readonly context: TripValuationContext | null
  readonly rule?: ApplicableFreightRule | null
}) {
  const ruleCalls: object[] = []
  return {
    result: readTripValuation({
      companyId: COMPANY_ID,
      repository: {
        findApplicableRule: (call) => {
          ruleCalls.push(call)
          return Promise.resolve(input.rule === undefined ? TEN_PERCENT_RULE : input.rule)
        },
        readContext: () => Promise.resolve(input.context),
      },
      tripId: TRIP_ID,
    }),
    ruleCalls,
  }
}

describe('a viagem diz quanto rende antes de qualquer emissão', () => {
  it('calcula a receita pelos parâmetros e a marca como previsão', async () => {
    const world = run({ context: context() })
    const valuation = await world.result

    expect(valuation.totalRevenue).toBe('100.0000')
    expect(valuation.revenueSource).toBe('estimated')
    expect(valuation.revenueLines[0]?.gap).toBeNull()
  })

  /** O município é a dimensão nova da D6, e é ele que separa CT-e de NFS-e na precificação. */
  it('leva o município e o emitente da nota para a escolha da regra', async () => {
    const world = run({ context: context() })
    await world.result

    expect(world.ruleCalls).toEqual([
      {
        companyId: COMPANY_ID,
        destinationCityCode: '3550308',
        destinationState: 'SP',
        issuedAt: '2026-07-22T12:00:00.000Z',
        ruleType: 'percentage_of_invoice_total',
        senderTaxId: '61084018000109',
      },
    ])
  })

  /** D1 da 061: o documento autorizado vence o parâmetro — previsão decide hoje, medido mede ontem. */
  it('a nota com CT-e autorizado sobe medida, e nem consulta a regra', async () => {
    const world = run({
      context: context({ documents: [document({ measuredAmount: '137.5000' })] }),
    })
    const valuation = await world.result

    expect(valuation.totalRevenue).toBe('137.5000')
    expect(valuation.revenueSource).toBe('measured')
    expect(world.ruleCalls).toEqual([])
  })

  it('nota sem regra aplicável entra zero, marcada como ausente', async () => {
    const valuation = await run({ context: context(), rule: null }).result

    expect(valuation.totalRevenue).toBe('0.0000')
    expect(valuation.revenueSource).toBe('missing')
    expect(valuation.revenueLines[0]?.gap).toBe(VALUATION_GAPS.noFreightRule)
    expect(valuation.hasGaps).toBe(true)
  })

  /**
   * 200 km a 2,5 km/l são 80 litros; a 6,00 o litro, 480,00. Mais 0,30/km de outros custos, 60,00.
   * As duas contas saem da mesma distância planejada, e é por isso que o vetor é um só.
   */
  it('compõe o custo com combustível e outros custos por quilômetro', async () => {
    const valuation = await run({ context: context() }).result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('fuel')).toMatchObject({ amount: '480.0000', source: 'estimated' })
    expect(byKind.get('other_per_kilometer')).toMatchObject({
      amount: '60.0000',
      source: 'estimated',
    })
    expect(valuation.totalCost).toBe('540.0000')
  })

  /** Sem roteiro não há quilometragem, e zero faria o combustível parecer de graça. */
  it('sem distância planejada as duas parcelas por quilômetro ficam ausentes', async () => {
    const valuation = await run({ context: context({ distanceMeters: null }) }).result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('fuel')).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.noPlannedDistance,
      source: 'missing',
    })
    expect(byKind.get('other_per_kilometer')?.gap).toBe(VALUATION_GAPS.noPlannedDistance)
    expect(valuation.totalCost).toBe('0.0000')
  })

  it('sem preço de combustível cadastrado a parcela se declara, em vez de sumir', async () => {
    const valuation = await run({ context: context({ fuelPricePerLiter: null }) }).result
    const fuel = valuation.costParcels.find((parcel) => parcel.kind === 'fuel')

    expect(fuel).toMatchObject({ gap: VALUATION_GAPS.noFuelBaseline, source: 'missing' })
  })

  /**
   * Motorista, pedágio e taxa de entrega ainda não têm fonte no produto. Elas aparecem **por nome**
   * como ausentes: total com buraco declarado é honesto, total com buraco escondido não é.
   */
  it('as três parcelas sem fonte aparecem ausentes, nunca zero calado', async () => {
    const valuation = await run({ context: context() }).result
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('driver')?.gap).toBe(VALUATION_GAPS.noDriverRate)
    expect(byKind.get('toll')?.gap).toBe(VALUATION_GAPS.notRecorded)
    expect(byKind.get('delivery_charges')?.gap).toBe(VALUATION_GAPS.featureAbsent)
    expect(valuation.hasGaps).toBe(true)
  })

  it('viagem de outra empresa é 404', async () => {
    await expect(run({ context: null }).result).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' })
  })
})
