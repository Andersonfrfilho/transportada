/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF8/CA06: o tipo `off` não carrega produto — a seleção sai ao trocar para ele, e a leitura
 * de um tipo sem `itemsMode` (API anterior) é `optional`.
 */
import { describe, expect, test } from 'bun:test'

import {
  carriesOccurrenceItems,
  resolveItemsOnTypeChange,
  resolveOccurrenceItemsMode,
} from '@/modules/trip/shared/occurrenceItemsMode.service'
import type { OccurrenceQuantitiesByCode } from '@/modules/trip/shared/occurrenceProductSelection.service'

const QUANTITIES: OccurrenceQuantitiesByCode = new Map([
  ['696', { quantity: '2', unit: 'box' }],
  ['697', { quantity: '5', unit: 'unit' }],
])

describe('leitura do modo de itens do tipo', () => {
  test('sem tipo, ou tipo sem itemsMode (API anterior), lê optional', () => {
    expect(resolveOccurrenceItemsMode(undefined)).toBe('optional')
    expect(resolveOccurrenceItemsMode({})).toBe('optional')
  })

  test('off e optional lidos como vieram; só off não carrega itens', () => {
    expect(resolveOccurrenceItemsMode({ itemsMode: 'off' })).toBe('off')
    expect(carriesOccurrenceItems('off')).toBe(false)
    expect(carriesOccurrenceItems('optional')).toBe(true)
    expect(carriesOccurrenceItems('required')).toBe(true)
  })
})

describe('trocar de tipo no registro (CA06)', () => {
  const SELECTED = { productCodes: ['696', '697'], quantitiesByCode: QUANTITIES }

  test('para tipo off, a seleção e as quantidades são limpas', () => {
    const next = resolveItemsOnTypeChange({
      ...SELECTED,
      nextType: { allowsMultipleItems: true, itemsMode: 'off' },
    })
    expect(next.productCodes).toEqual([])
    expect(next.quantitiesByCode.size).toBe(0)
  })

  test('para tipo off de item único, também limpa tudo', () => {
    const next = resolveItemsOnTypeChange({
      ...SELECTED,
      nextType: { allowsMultipleItems: false, itemsMode: 'off' },
    })
    expect(next.productCodes).toEqual([])
  })

  test('para tipo optional de item único, fica só a primeira escolha (spec 166 RF8)', () => {
    const next = resolveItemsOnTypeChange({
      ...SELECTED,
      nextType: { allowsMultipleItems: false, itemsMode: 'optional' },
    })
    expect(next.productCodes).toEqual(['696'])
    expect(next.quantitiesByCode).toBe(QUANTITIES)
  })

  test('para tipo optional de vários, ou sem itemsMode, a seleção segue intacta', () => {
    for (const nextType of [
      { allowsMultipleItems: true, itemsMode: 'optional' as const },
      { allowsMultipleItems: true },
    ]) {
      expect(resolveItemsOnTypeChange({ ...SELECTED, nextType })).toEqual(SELECTED)
    }
  })
})
