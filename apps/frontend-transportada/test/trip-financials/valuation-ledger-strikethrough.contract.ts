/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildValuationLedger,
  STRUCK_THROUGH_GAPS,
} from '@/modules/trip-financials/shared/valuationLedger.service'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 122: **o razão risca a lacuna `FEATURE_ABSENT`, não a parcela `delivery_charges`.** O usuário
 * decidiu criar a página de taxas de entrega depois e, até lá, riscar a linha em vez do rótulo neutro
 * "módulo ainda não usado" — que soava como cadastro esquecido, não como recurso inexistente.
 *
 * ⚠️ A marca segue o **motivo da lacuna**: se `FEATURE_ABSENT` um dia nomear outra parcela ainda não
 * construída, ela herda o mesmo risco sem código novo, e nenhuma outra lacuna muda de aparência.
 */
function valuation(overrides: Partial<TripValuation> = {}): TripValuation {
  return {
    costParcels: [],
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

describe('valuation ledger strikethrough contract', () => {
  test('só a lacuna FEATURE_ABSENT entra na lista de risco', () => {
    expect(STRUCK_THROUGH_GAPS).toEqual(['FEATURE_ABSENT'])
  })

  test('delivery_charges com FEATURE_ABSENT sai marcado para risco', () => {
    const ledger = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '0.00',
            basis: null,
            detail: null,
            gap: 'FEATURE_ABSENT',
            kind: 'delivery_charges',
            source: 'missing',
          },
        ],
        hasGaps: true,
      }),
    )!

    const [line] = ledger.operating
    expect(line?.kind).toBe('delivery_charges')
    expect(line?.gap).toBe('FEATURE_ABSENT')
    expect(line?.isGapStruckThrough).toBe(true)
  })

  test('nenhuma outra lacuna sai marcada para risco', () => {
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
          {
            amount: '0.00',
            basis: null,
            detail: null,
            gap: 'NO_DRIVER_RATE',
            kind: 'driver',
            source: 'missing',
          },
        ],
        hasGaps: true,
      }),
    )!

    for (const line of ledger.operating) {
      expect(line.isGapStruckThrough, `${line.kind} (${line.gap}) não deveria riscar`).toBe(false)
    }
  })

  /**
   * ⚠️ A marca é da lacuna, nunca da parcela: uma parcela diferente com o mesmo `FEATURE_ABSENT`
   * também risca, sem precisar tocar em código — é o comportamento que a razão do teste acima
   * declarou por escrito.
   */
  test('a marca acompanha o gap, não o kind', () => {
    const ledger = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '0.00',
            basis: null,
            detail: null,
            gap: 'FEATURE_ABSENT',
            kind: 'other_per_kilometer',
            source: 'missing',
          },
        ],
        hasGaps: true,
      }),
    )!

    expect(ledger.operating[0]?.isGapStruckThrough).toBe(true)
  })

  /**
   * O risco é aparência, nunca conta: os totais do razão são exatamente os que a API mandou, com ou
   * sem a parcela riscada.
   */
  test('os totais do razão não mudam com a parcela riscada', () => {
    const withoutGap = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '312.80',
            basis: null,
            detail: null,
            gap: null,
            kind: 'toll',
            source: 'measured',
          },
        ],
      }),
    )!
    const withStruckGap = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '312.80',
            basis: null,
            detail: null,
            gap: null,
            kind: 'toll',
            source: 'measured',
          },
          {
            amount: '0.00',
            basis: null,
            detail: null,
            gap: 'FEATURE_ABSENT',
            kind: 'delivery_charges',
            source: 'missing',
          },
        ],
        hasGaps: true,
      }),
    )!

    expect(withStruckGap.totalCost).toBe(withoutGap.totalCost)
    expect(withStruckGap.totalMargin).toBe(withoutGap.totalMargin)
    expect(withStruckGap.totalRevenue).toBe(withoutGap.totalRevenue)
    expect(withStruckGap.marginPercentage).toBe(withoutGap.marginPercentage)
    /** A lacuna sem valor não entra na soma das linhas conhecidas — como antes desta spec. */
    expect(withStruckGap.sum).toBe(withoutGap.sum)
  })

  test('o componente risca só quando isGapStruckThrough é verdadeiro, e o texto continua presente', async () => {
    const source = await readSource(
      'src/modules/trip-financials/components/ValuationLedger.component.tsx',
    )

    expect(source).toContain('line.isGapStruckThrough')
    expect(source).toContain('styles.ledgerGapAbsent')
    /** O texto da lacuna é composto fora do `if` do risco: risco não troca o texto por outra coisa. */
    expect(source).toContain('t(`gap.${line.gap}`, { defaultValue: line.gap })')
  })

  test('o risco é estilo do design system, nunca inline nem hexadecimal', async () => {
    const source = await readSource('src/modules/trip-financials/styles/tripFinancials.module.css')

    expect(source).toContain('.ledgerGapAbsent')
    expect(source).toContain('text-decoration: line-through')
    expect(source).toContain('var(--color-copper)')

    const component = await readSource(
      'src/modules/trip-financials/components/ValuationLedger.component.tsx',
    )
    expect(component).not.toContain('style={{')
    expect(component).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})
