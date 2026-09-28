/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 217 Fase 4 (T401) — **a viagem sem veículo tem conta, e a conta diz o que falta.** A RF1
 * publicou a criação de viagem sem veículo, e a leitura da valoração é disparada em todo detalhe de
 * viagem: sem esta lacuna o painel financeiro respondia 404 dizendo que a viagem não existe.
 *
 * ⚠️ O que cada caso prende é **qual** lacuna sai. Mandar o operador cadastrar consumo médio na
 * ficha de um caminhão que ninguém escolheu é pior que não dizer nada — ele abre a frota, encontra
 * o campo preenchido, e a conta continua sem combustível.
 */
import { describe, expect, it } from 'bun:test'

import {
  readTripValuation,
  type ApplicableFreightRule,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'

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

/** A viagem recém-salva como rascunho: sem veículo, sem roteiro, e com uma nota escolhida. */
function context(overrides: Partial<TripValuationContext> = {}): TripValuationContext {
  return {
    distanceMeters: null,
    documents: [
      {
        destinationCityCode: '3550308',
        destinationState: 'SP',
        issuedAt: '2026-07-22T12:00:00.000Z',
        measuredAmount: null,
        nfeDocumentId: '00000000-0000-4000-8000-000000000c01',
        nfeTotalAmount: '1000.0000',
        senderTaxId: '61084018000109',
        tripDocumentId: '00000000-0000-4000-8000-000000000d01',
      },
    ],
    fuelPricePerLiter: '6.0000',
    vehicle: null,
    ...overrides,
  }
}

function run(valuationContext: TripValuationContext) {
  return readTripValuation({
    companyId: COMPANY_ID,
    repository: {
      findApplicableRule: () => Promise.resolve(TEN_PERCENT_RULE),
      readContext: () => Promise.resolve(valuationContext),
    },
    tripId: TRIP_ID,
  })
}

async function parcels(valuationContext: TripValuationContext) {
  const valuation = await run(valuationContext)

  return new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))
}

describe('a viagem sem veículo diz o que falta, e nunca estoura (spec 217 Fase 4)', () => {
  /**
   * O caso da RF1 inteiro: o rascunho salvo pelo painel não tem veículo nem roteiro, e o painel
   * financeiro abre. Antes deste conserto ele respondia `TRIP_NOT_FOUND` — a viagem existia.
   */
  it('a leitura devolve a conta em vez de lançar', async () => {
    const valuation = await run(context())

    expect(valuation.totalRevenue).toBe('100.0000')
    expect(valuation.hasGaps).toBe(true)
  })

  /**
   * ⚠️ As três parcelas que saem do veículo carregam a **mesma** lacuna, e é de propósito: o que
   * falta é um só cadastro — a escolha do caminhão —, e três textos diferentes mandariam o operador
   * a três telas para resolver uma coisa.
   */
  it('combustível, pedágio e outros-por-quilômetro saem como NO_VEHICLE', async () => {
    const byKind = await parcels(context())

    expect(byKind.get('fuel')).toMatchObject({
      amount: '0.0000',
      detail: null,
      gap: VALUATION_GAPS.noVehicle,
      source: 'missing',
    })
    expect(byKind.get('other_per_kilometer')).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.noVehicle,
      source: 'missing',
    })
    expect(byKind.get('toll')).toMatchObject({
      amount: '0.0000',
      gap: VALUATION_GAPS.noVehicle,
      source: 'missing',
    })
  })

  /**
   * ⚠️ A ordem importa, e este é o caso que a prende: a viagem sem veículo **também** está sem
   * roteiro, porque planejar rota exige `draft` e `draft` exige a tripulação montada (D1). Se a
   * distância viesse primeiro, `NO_VEHICLE` nunca apareceria no combustível na vida real — e o
   * operador leria "calcule o roteiro" num botão que não existe sem caminhão escolhido.
   */
  it('a falta de veículo vence a falta de distância, porque é ela que vem antes', async () => {
    const byKind = await parcels(context({ distanceMeters: null }))

    expect(byKind.get('fuel')?.gap).toBe(VALUATION_GAPS.noVehicle)
    expect(byKind.get('other_per_kilometer')?.gap).toBe(VALUATION_GAPS.noVehicle)
  })

  /**
   * ⚠️ O par que separa as duas telas, no mesmo molde de `noFuelBaseline` × `noFuelPrice`:
   * "ninguém escolheu caminhão" se resolve na viagem, "o caminhão não declara consumo" na ficha da
   * frota. Uma lacuna só levaria metade dos casos à tela errada.
   */
  it('veículo escolhido sem consumo continua NO_FUEL_CONSUMPTION, nunca NO_VEHICLE', async () => {
    const byKind = await parcels(
      context({
        distanceMeters: 200_000,
        vehicle: { kilometersPerLiter: null, otherCostsPerKilometer: null },
      }),
    )

    expect(byKind.get('fuel')?.gap).toBe(VALUATION_GAPS.noFuelConsumption)
    expect(byKind.get('other_per_kilometer')?.gap).toBe(VALUATION_GAPS.notRecorded)
  })

  /**
   * Regressão da conta inteira: com veículo, nada muda. 200 km a 2,5 km/l são 80 litros; a 6,00 o
   * litro, 480,00. Mais 0,30/km, 60,00.
   */
  it('viagem com veículo produz as mesmas parcelas de sempre', async () => {
    const byKind = await parcels(
      context({
        distanceMeters: 200_000,
        vehicle: { kilometersPerLiter: '2.5000', otherCostsPerKilometer: '0.3000' },
      }),
    )

    expect(byKind.get('fuel')).toMatchObject({ amount: '480.0000', gap: null, source: 'estimated' })
    expect(byKind.get('other_per_kilometer')).toMatchObject({
      amount: '60.0000',
      gap: null,
      source: 'estimated',
    })
    expect(byKind.get('toll')?.gap).toBe(VALUATION_GAPS.notRecorded)
  })

  /**
   * ⚠️ **Pedágio lançado vence a falta de veículo.** É dinheiro que já saiu do caixa, e trocá-lo por
   * uma lacuna esconderia pagamento feito — a mesma inversão que `resolveTollParcel` proíbe entre o
   * lançamento e a projeção.
   */
  it('pedágio já lançado continua medido, mesmo sem veículo', async () => {
    const byKind = await parcels(context({ tollTotal: '120.0000' }))

    expect(byKind.get('toll')).toMatchObject({
      amount: '120.0000',
      gap: null,
      source: 'measured',
    })
  })

  /** A tripulação tem lacuna própria: sem veículo **e** sem condutor, cada falta se nomeia. */
  it('a lacuna do condutor não é engolida pela do veículo', async () => {
    const byKind = await parcels(context())

    expect(byKind.get('driver')?.gap).toBe(VALUATION_GAPS.noTripDriver)
  })
})
