/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceCorrectionHistory } from '@/modules/trip/components/OccurrenceCorrectionHistory.component'
import { resolveOccurrenceCorrectionHistory } from '@/modules/trip/shared/tripOccurrenceDetail.service'
import type { TripOccurrenceDetail } from '@/modules/trip/shared/tripOccurrenceFeed.service'

import { buildOccurrenceDetailFixture } from '../fixtures/tripOccurrenceDetail.fixture'

const FIRST_CORRECTION_AT = '2026-10-02T09:15:00.000Z'

function formatMoment(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function textOf(occurrence: TripOccurrenceDetail): string {
  return renderToStaticMarkup(<OccurrenceCorrectionHistory occurrence={occurrence} />)
    .replace(/<[^>]+>/gu, '|')
    .replace(/\|+/gu, '|')
}

describe('histórico de correções no detalhe (spec 235 T4.1, RF5, P3)', () => {
  test('uma correção mostra autor, data/hora e o conjunto que passou a valer', () => {
    const text = textOf(
      buildOccurrenceDetailFixture({
        corrections: [
          {
            correctedAt: FIRST_CORRECTION_AT,
            correctedByName: 'Ana Operadora',
            previousItems: [{ code: '696', quantity: '1.000', unit: 'box' }],
          },
        ],
        items: [{ code: '696', description: 'Produto A', quantity: '3.000', unit: 'box' }],
      }),
    )
    expect(text).toContain('|Correções|')
    expect(text).toContain(`Corrigida por Ana Operadora em ${formatMoment(FIRST_CORRECTION_AT)}`)
    expect(text).toContain('Passou a valer: 696 · 3 box')
    expect(text).not.toContain('696 · 1 box')
  })

  test('item sem quantidade aparece só pelo código', () => {
    const text = textOf(
      buildOccurrenceDetailFixture({
        corrections: [
          { correctedAt: FIRST_CORRECTION_AT, correctedByName: 'Ana Operadora', previousItems: [] },
        ],
        items: [
          { code: '696', description: 'Produto A', quantity: '3.000', unit: 'box' },
          { code: '697', description: 'Produto B', quantity: null, unit: null },
        ],
      }),
    )
    expect(text).toContain('Passou a valer: 696 · 3 box, 697|')
  })

  test('sem correção, ou com a chave ausente, nada é renderizado', () => {
    expect(textOf(buildOccurrenceDetailFixture({ corrections: [] }))).toBe('')
    const withoutCorrections: Partial<Record<'corrections', unknown>> = {
      ...buildOccurrenceDetailFixture(),
    }
    delete withoutCorrections.corrections
    expect(textOf(withoutCorrections as TripOccurrenceDetail)).toBe('')
  })

  test('a função pura devolve vazio para lista vazia', () => {
    expect(resolveOccurrenceCorrectionHistory([], [])).toEqual([])
  })
})
