import { describe, expect, test } from 'bun:test'

import { buildValuationLedger } from '@/modules/trip-financials/shared/valuationLedger.service'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'

/**
 * Spec 110 D7: **a conta numa coluna, com a derivação na linha de baixo.**
 *
 * A versão anterior tinha o mesmo número em três lugares — o topo, a lista de parcelas e um painel
 * lateral —, e três lugares é onde eles começam a discordar.
 */
function valuation(overrides: Partial<TripValuation> = {}): TripValuation {
  return {
    costParcels: [
      {
        amount: '413.79',
        basis: {
          kilometersPerLiter: '2.8000',
          litres: '65.7857',
          of: 'fuel',
          pricePerLiter: '6.2900',
        },
        detail: null,
        gap: null,
        kind: 'fuel',
        source: 'estimated',
      },
      { amount: '312.80', basis: null, detail: null, gap: null, kind: 'toll', source: 'measured' },
      {
        amount: '1480.00',
        basis: {
          of: 'driver',
          paymentModel: 'route_table',
          regionCity: 'JABOTICABAL',
          regionCode: '1.002',
          vehicleClass: 'toco',
        },
        detail: null,
        gap: null,
        kind: 'driver',
        source: 'measured',
      },
      { amount: '518.40', basis: null, detail: null, gap: null, kind: 'icms', source: 'measured' },
    ],
    hasGaps: false,
    marginPercentage: '0.2805',
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '2724.99',
    totalMargin: '1595.01',
    totalRevenue: '4320.00',
    ...overrides,
  }
}

describe('valuation ledger contract', () => {
  /**
   * ⚠️ O agregado costuma ser o **dobro** do combustível. Na ordem que a API devolve ele cai no meio
   * da lista, e é por ele que a viagem se decide.
   */
  test('a operação vem ordenada pela maior parcela', () => {
    const ledger = buildValuationLedger(valuation())!

    expect(ledger.operating.map((line) => line.kind)).toEqual(['driver', 'fuel', 'toll'])
  })

  /** ADR-0049 §4: imposto desce da receita, não é gasto de rodar — e a coluna separa os dois. */
  test('imposto não se mistura com operação', () => {
    const ledger = buildValuationLedger(valuation())!

    expect(ledger.taxes.map((line) => line.kind)).toEqual(['icms'])
    expect(ledger.operating.map((line) => line.kind)).not.toContain('icms')
  })

  test('a soma das linhas bate com o total que a API mandou', () => {
    const ledger = buildValuationLedger(valuation())!

    expect(ledger.totalCost).toBe('2724.99')
    expect(ledger.sum).toBe('2724.99')
  })

  /**
   * ⚠️ **A parcela sem valor fica na lista**, com o motivo no lugar do número. Sumir é o que faz um
   * total incompleto parecer completo — e ela vai para o **fim** da operação, para o olho encontrar
   * primeiro os custos que existem.
   */
  test('a parcela com lacuna fica, e fecha a operação', () => {
    const ledger = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '0.00',
            basis: null,
            detail: null,
            gap: 'NO_FUEL_CONSUMPTION',
            kind: 'fuel',
            source: 'missing',
          },
          {
            amount: '312.80',
            basis: null,
            detail: null,
            gap: null,
            kind: 'toll',
            source: 'measured',
          },
        ],
        hasGaps: true,
      }),
    )!

    expect(ledger.operating.map((line) => line.kind)).toEqual(['toll', 'fuel'])
    expect(ledger.operating[1]).toEqual({
      amount: null,
      basis: null,
      detail: null,
      gap: 'NO_FUEL_CONSUMPTION',
      kind: 'fuel',
    })
    expect(ledger.hasGaps).toBe(true)
  })

  test('a derivação do combustível sobe crua, para a tela compor a frase', () => {
    const [driver, fuel] = buildValuationLedger(valuation())?.operating ?? []

    expect(fuel?.basis).toEqual({
      kilometersPerLiter: '2.8000',
      litres: '65.7857',
      of: 'fuel',
      pricePerLiter: '6.2900',
    })
    expect(driver?.basis).toEqual({
      of: 'driver',
      paymentModel: 'route_table',
      regionCity: 'JABOTICABAL',
      regionCode: '1.002',
      vehicleClass: 'toco',
    })
  })

  /** Sem permissão de dinheiro não há avaliação, e o razão é ausência — nunca moldura vazia. */
  test('sem avaliação não há razão', () => {
    expect(buildValuationLedger(null)).toBeNull()
  })
})
