/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isTotalQuantityText,
  resolveTotalQuantityText,
} from '@/modules/driver-trip/shared/occurrenceTotalQuantity.service'

/** Spec 247 (T7.3x): a quantidade do botão "Total da nota" sai do texto da nota, em `bigint`, sem `number`. */
describe('a quantidade total da nota que o botão preenche (spec 247 T7.3x)', () => {
  test.each([
    ['3', '3'],
    ['3.0000', '3'],
    ['3.000', '3'],
    ['2.5000', '2,5'],
    ['2.500', '2,5'],
    ['0.333', '0,333'],
    ['0.3330', '0,333'],
    ['1000', '1000'],
    ['1000.0000', '1000'],
    ['007.5', '7,5'],
  ])('a nota com %s vira o texto %s', (onNote, expected) => {
    expect(resolveTotalQuantityText(onNote)).toBe(expected)
  })

  test.each([
    ['vazia', ''],
    ['zero', '0'],
    ['zero com casas', '0.0000'],
    ['inválida', 'abc'],
    ['negativa', '-1'],
    ['mais de três casas significativas', '0.3333'],
    ['mais de nove dígitos inteiros', '1234567890'],
  ])('a nota %s não tem botão', (_name, onNote) => {
    expect(resolveTotalQuantityText(onNote)).toBeUndefined()
  })

  test('o campo já está no total quando vale o mesmo que a nota, qualquer que seja a grafia', () => {
    expect(isTotalQuantityText({ onNote: '3.0000', quantityText: '3' })).toBe(true)
    expect(isTotalQuantityText({ onNote: '3.0000', quantityText: '3,0' })).toBe(true)
    expect(isTotalQuantityText({ onNote: '2.5000', quantityText: '2,50' })).toBe(true)
    expect(isTotalQuantityText({ onNote: '3.0000', quantityText: '1' })).toBe(false)
    expect(isTotalQuantityText({ onNote: '3.0000', quantityText: '' })).toBe(false)
    expect(isTotalQuantityText({ onNote: '3.0000', quantityText: '3,' })).toBe(true)
  })
})
