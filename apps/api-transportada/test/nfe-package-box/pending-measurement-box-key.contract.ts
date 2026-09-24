/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildPendingMeasurementBoxKey,
  resolveUniquePackageBoxId,
} from '../../src/nfe-documents/domain/pending-measurement-box.policy.js'

describe('chave da pendência de medição para a caixa (spec 168)', () => {
  test('casa por (número da nota, código do produto)', () => {
    expect(buildPendingMeasurementBoxKey({ documentNumber: '123', productCode: 'ABC' })).toBe(
      buildPendingMeasurementBoxKey({ documentNumber: '123', productCode: 'ABC' }),
    )
    expect(buildPendingMeasurementBoxKey({ documentNumber: '123', productCode: 'ABC' })).not.toBe(
      buildPendingMeasurementBoxKey({ documentNumber: '124', productCode: 'ABC' }),
    )
  })

  test('nota ou produto ausente não casa com nada', () => {
    expect(buildPendingMeasurementBoxKey({ documentNumber: null, productCode: 'ABC' })).toBeNull()
    expect(buildPendingMeasurementBoxKey({ documentNumber: '123', productCode: null })).toBeNull()
  })

  test('uma única caixa distinta resolve o id', () => {
    expect(resolveUniquePackageBoxId(['box-1', 'box-1'])).toBe('box-1')
  })

  test('duas caixas diferentes para a mesma pendência são ambíguas: null, nunca um palpite', () => {
    expect(resolveUniquePackageBoxId(['box-1', 'box-2'])).toBeNull()
  })

  test('nenhuma caixa encontrada é null', () => {
    expect(resolveUniquePackageBoxId([])).toBeNull()
  })
})
