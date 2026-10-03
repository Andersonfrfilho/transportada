/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceCorrectionItems,
  resolveOccurrenceItemSelectionFromDetail,
} from '@/modules/trip/shared/occurrenceProductSelection.service'

function readComponent(name: string): string {
  return readFileSync(new URL(`../../src/modules/trip/components/${name}`, import.meta.url), 'utf8')
}

describe('o conjunto de itens da correção (spec 240 T2.2, RF2)', () => {
  test('reabre com os itens, as quantidades e a unidade legada que a nota gravou', () => {
    const selection = resolveOccurrenceItemSelectionFromDetail([
      { code: '696', description: 'A', quantity: '3.000', unit: 'CX30' },
      { code: '697', description: 'B', quantity: null, unit: null },
    ])
    expect(selection.productCodes).toEqual(['696', '697'])
    expect([...selection.quantitiesByCode]).toEqual([['696', { quantity: '3.000', unit: 'CX30' }]])
  })

  test('envia o conjunto inteiro, com contagem só nos itens que a têm', () => {
    const items = buildOccurrenceCorrectionItems({
      codes: ['696', '697', '698'],
      quantitiesByCode: new Map([
        ['696', { quantity: '4', unit: 'box' }],
        ['698', { quantity: '  ', unit: 'unit' }],
      ]),
    })
    expect(items).toEqual([
      { code: '696', quantity: '4', unit: 'box' },
      { code: '697' },
      { code: '698' },
    ])
    expect(Object.keys(items[1] ?? {})).toEqual(['code'])
  })

  test('registro e correção usam o mesmo seletor e o mesmo campo de quantidade, sem cópia', () => {
    for (const consumer of [
      'TripOccurrences.component.tsx',
      'TripOccurrenceCorrectionForm.component.tsx',
    ]) {
      const source = readComponent(consumer)
      expect(source).toContain('<OccurrenceProductSelect')
      expect(source).toContain('<OccurrenceItemQuantities')
      expect(source).not.toContain('<MultiSelect')
    }
  })
})
