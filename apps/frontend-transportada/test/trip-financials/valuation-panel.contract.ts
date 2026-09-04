/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  summarizeTripValuation,
  type TripValuation,
} from '@/modules/trip-financials/shared/tripValuation.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function valuation(input: Partial<TripValuation> = {}): TripValuation {
  return {
    costParcels: [],
    hasGaps: false,
    marginPercentage: '12.5000',
    revenueLines: [],
    revenueSource: 'measured',
    totalCost: '1750.0000',
    totalMargin: '250.0000',
    totalRevenue: '2000.0000',
    ...input,
  }
}

/**
 * A viagem aberta não tem conta congelada, e o painel dizia exatamente isso — "o que existe é a
 * avaliação prevista" — **sem mostrar a avaliação prevista**. Ela existe na API desde a 061
 * (`GET /trips/:id/valuation`) e nenhum consumidor a lia.
 */
describe('a avaliação prevista da viagem', () => {
  test('resume ganho, custo e margem', () => {
    const resumo = summarizeTripValuation(valuation())

    expect(resumo).not.toBeNull()
    expect(resumo?.revenue).toBe('2000.0000')
    expect(resumo?.cost).toBe('1750.0000')
    expect(resumo?.margin).toBe('250.0000')
  })

  /** Margem nula é receita zero — dividir por zero daria margem infinita, não informação. */
  test('margem ausente não vira zero', () => {
    expect(
      summarizeTripValuation(valuation({ marginPercentage: null }))?.marginPercentage,
    ).toBeNull()
  })

  /**
   * ⚠️ O total sozinho mente quando falta parcela: sem regra de frete, sem consumo do veículo ou
   * sem roteiro calculado, o número sai menor do que a viagem custa. A tela é obrigada a dizer isso
   * ao lado do número — esconder o número seria pior, e mostrá-lo mudo é o que engana.
   */
  test('lacuna viaja junto do número, nomeada', () => {
    const resumo = summarizeTripValuation(
      valuation({
        costParcels: [
          { amount: '0.0000', gap: 'NO_FUEL_BASELINE', kind: 'fuel', source: 'estimated' },
        ],
        hasGaps: true,
      }),
    )

    expect(resumo?.hasGaps).toBe(true)
    expect(resumo?.gaps).toEqual(['NO_FUEL_BASELINE'])
  })

  test('sem avaliação não há resumo', () => {
    expect(summarizeTripValuation(null)).toBeNull()
  })

  test('o painel consome a avaliação, e a tela a busca', async () => {
    const [painel, cliente] = await Promise.all([
      Bun.file(
        new URL(
          'src/modules/trip-financials/components/TripFinancialPanel.component.tsx',
          APPLICATION_ROOT,
        ),
      ).text(),
      Bun.file(
        new URL(
          'src/modules/trip-financials/shared/tripFinancialsClient.service.ts',
          APPLICATION_ROOT,
        ),
      ).text(),
    ])

    // A chamada, não o import: o nome no `import` sozinho passa com o painel sem consumir nada.
    expect(painel).toContain('summarizeTripValuation(valuation)')
    expect(painel).toContain("t('panel.expectedRevenue')")
    expect(painel).toContain("t('panel.expectedCost')")
    expect(cliente).toContain('/valuation')
  })
})
