/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceCorrectionHistory } from '@/modules/trip/components/OccurrenceCorrectionHistory.component'
import { resolveOccurrenceCorrectionHistory } from '@/modules/trip/shared/tripOccurrenceDetail.service'
import type { TripOccurrenceDetail } from '@/modules/trip/shared/tripOccurrenceFeed.service'

import { buildOccurrenceDetailFixture } from '../fixtures/tripOccurrenceDetail.fixture'

const FIRST_CORRECTION_AT = '2026-10-02T09:15:00.000Z'
const SECOND_CORRECTION_AT = '2026-10-02T14:40:00.000Z'

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

describe('duas correções seguidas (spec 235 T4.2, P3)', () => {
  const twice = buildOccurrenceDetailFixture({
    corrections: [
      {
        correctedAt: FIRST_CORRECTION_AT,
        correctedByName: 'Ana Operadora',
        previousItems: [
          { code: '696', quantity: '1.000', unit: 'box' },
          { code: '697', quantity: '1.000', unit: 'unit' },
        ],
      },
      {
        correctedAt: SECOND_CORRECTION_AT,
        correctedByName: 'Bruno Operador',
        previousItems: [
          { code: '696', quantity: '2.000', unit: 'box' },
          { code: '697', quantity: '5.000', unit: 'unit' },
        ],
      },
    ],
    items: [
      { code: '696', description: 'Produto A', quantity: '3.000', unit: 'box' },
      { code: '697', description: 'Produto B', quantity: '5.000', unit: 'unit' },
    ],
  })

  test('as duas aparecem, a mais antiga primeiro, cada uma com o conjunto que passou a valer nela', () => {
    const text = textOf(twice)
    const first = text.indexOf(
      `Corrigida por Ana Operadora em ${formatMoment(FIRST_CORRECTION_AT)}`,
    )
    const second = text.indexOf(
      `Corrigida por Bruno Operador em ${formatMoment(SECOND_CORRECTION_AT)}`,
    )
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThan(first)

    const firstSet = text.indexOf('Passou a valer: 696 · 2 box, 697 · 5 unit')
    const secondSet = text.indexOf('Passou a valer: 696 · 3 box, 697 · 5 unit')
    expect(firstSet).toBeGreaterThan(first)
    expect(firstSet).toBeLessThan(second)
    expect(secondSet).toBeGreaterThan(second)
  })

  test('a função pura encadeia: o vigente de uma é o anterior da seguinte, e a última vale o atual', () => {
    const history = resolveOccurrenceCorrectionHistory(twice.corrections ?? [], twice.items)
    expect(history.map((entry) => entry.correctedByName)).toEqual([
      'Ana Operadora',
      'Bruno Operador',
    ])
    expect(
      history.map((entry) => entry.items.map((item) => `${item.code}:${item.quantity}`)),
    ).toEqual([
      ['696:2.000', '697:5.000'],
      ['696:3.000', '697:5.000'],
    ])
  })
})
