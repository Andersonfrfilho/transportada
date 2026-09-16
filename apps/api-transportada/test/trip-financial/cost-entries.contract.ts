/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 D6: **o pedágio deixa de engolir o avulso.** `readTollTotal` somava todo
 * `trip_cost_entries` da viagem, sem filtrar `kind` — um lançamento `other` (avulso) inflava a
 * parcela `toll`. `readManualCostTotal` nasce para separar as duas leituras, alimentando a parcela
 * `manual`, que já existia no enum e nunca fora usada. Corrige um defeito vivo: qualquer avulso já
 * lançado hoje soma, sem querer, na conta de pedágio.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  readTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'

function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [],
    fuelPricePerLiter: null,
    vehicle: { kilometersPerLiter: null, otherCostsPerKilometer: null },
    ...overrides,
  }
}

function run(input: TripValuationContext) {
  return readTripValuation({
    companyId: COMPANY_ID,
    repository: {
      findApplicableRule: () => Promise.resolve(null),
      readContext: () => Promise.resolve(input),
    },
    tripId: TRIP_ID,
  })
}

/** Aceite 6, parte das parcelas: pedágio e avulso nunca se somam na mesma linha. */
describe('pedágio e avulso não se somam mais na mesma parcela (spec 143 D6)', () => {
  test('só pedágio lançado: a parcela toll recebe o valor e a manual fica sem lançamento', async () => {
    const valuation = await run(context({ tollTotal: '44.6000' }))
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('toll')).toMatchObject({ amount: '44.6000', gap: null, source: 'measured' })
    expect(byKind.get('manual')).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.notRecorded,
      source: 'missing',
    })
  })

  test('só avulso lançado: a parcela manual recebe o valor e o pedágio não é inflado por ele', async () => {
    const valuation = await run(context({ manualCostTotal: '80.0000' }))
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('manual')).toMatchObject({
      amount: '80.0000',
      gap: null,
      source: 'measured',
    })
    expect(byKind.get('toll')).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.notRecorded,
      source: 'missing',
    })
  })

  test('os dois lançados na mesma viagem: cada parcela guarda só o próprio valor', async () => {
    const valuation = await run(context({ manualCostTotal: '80.0000', tollTotal: '44.6000' }))
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('toll')).toMatchObject({ amount: '44.6000', gap: null, source: 'measured' })
    expect(byKind.get('manual')).toMatchObject({
      amount: '80.0000',
      gap: null,
      source: 'measured',
    })
  })

  /** Ausência de lançamento, não gratuidade (vale para as duas leituras) — nunca zero silencioso. */
  test('nenhum dos dois lançado: as duas parcelas ficam sem lançamento', async () => {
    const valuation = await run(context())
    const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))

    expect(byKind.get('toll')).toMatchObject({ gap: VALUATION_GAPS.notRecorded, source: 'missing' })
    expect(byKind.get('manual')).toMatchObject({
      gap: VALUATION_GAPS.notRecorded,
      source: 'missing',
    })
  })
})

const query = readFileSync(
  new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
  'utf8',
)

/**
 * Por texto de fonte pelo mesmo motivo do contrato de fiação da 123 (`driver-rate-gap.contract.ts`):
 * a consulta fala com o Postgres, e um `where` sem o filtro certo compila e passa em todo caminho
 * feliz — só a leitura do texto pega o campo descartado.
 */
describe('a consulta separa pedágio de avulso na fonte (spec 143 D6)', () => {
  test('readTollTotal filtra kind = toll', () => {
    expect(query).toInclude(`eq(tripCostEntries.kind, 'toll')`)
  })

  test('readManualCostTotal existe e filtra kind = other', () => {
    expect(query).toInclude('readManualCostTotal')
    expect(query).toInclude(`eq(tripCostEntries.kind, 'other')`)
  })
})
