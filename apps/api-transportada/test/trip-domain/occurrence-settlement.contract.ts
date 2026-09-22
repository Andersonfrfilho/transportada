/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13 (RF22-RF24, CA9/CA9b): a política pura do acerto por item.
 */
import { describe, expect, test } from 'bun:test'

import {
  isOccurrenceSettlementWritable,
  resolveOccurrenceSettlement,
} from '../../src/trips/domain/occurrence-settlement.policy.js'
import {
  OccurrenceSettlementAmountInvalidError,
  OccurrenceSettlementItemUnknownError,
  OccurrenceSettlementPayerInvalidError,
} from '../../src/trips/domain/trip.error.js'

describe('acerto por item, com o pagador (spec 164 T13)', () => {
  test('soma os itens em `Decimal` (bigint escalado), nunca float', () => {
    const resolved = resolveOccurrenceSettlement({
      items: [
        { amount: '10.5000', amountSource: 'nfe', payerKind: 'contractor', productCode: 'A' },
        { amount: '0.0001', amountSource: 'manual', payerKind: 'insurer', productCode: 'B' },
      ],
      knownProductCodes: ['A', 'B'],
    })
    expect(resolved.total).toBe('10.5001')
    expect(resolved.items).toHaveLength(2)
  })

  test("`productCode = ''` é a nota inteira, e é item válido", () => {
    const resolved = resolveOccurrenceSettlement({
      items: [
        { amount: '100.0000', amountSource: 'manual', payerKind: 'carrier', productCode: '' },
      ],
      knownProductCodes: [''],
    })
    expect(resolved.total).toBe('100.0000')
  })

  test('item fora da ocorrência é `OccurrenceSettlementItemUnknownError` (422)', () => {
    expect(() =>
      resolveOccurrenceSettlement({
        items: [
          { amount: '10.0000', amountSource: 'manual', payerKind: 'contractor', productCode: 'X' },
        ],
        knownProductCodes: ['A'],
      }),
    ).toThrow(OccurrenceSettlementItemUnknownError)
  })

  /**
   * ⚠️ Só `0.0000` — o texto negativo (`-1.0000`) nem chega a ser um `Decimal` válido para
   * `parseScaledDecimal` (a fronteira HTTP, `MONEY_DECIMAL`, já recusa o sinal antes disso). O
   * CHECK do banco (`trip_occurrence_item_settlements_amount_check`, `amount > 0`) é a última linha.
   */
  test('valor `<= 0` é `OccurrenceSettlementAmountInvalidError` (422)', () => {
    expect(() =>
      resolveOccurrenceSettlement({
        items: [
          { amount: '0.0000', amountSource: 'manual', payerKind: 'contractor', productCode: 'A' },
        ],
        knownProductCodes: ['A'],
      }),
    ).toThrow(OccurrenceSettlementAmountInvalidError)
  })

  test('`driver` sem `payerId` é `OccurrenceSettlementPayerInvalidError` (422)', () => {
    expect(() =>
      resolveOccurrenceSettlement({
        items: [
          { amount: '10.0000', amountSource: 'manual', payerKind: 'driver', productCode: 'A' },
        ],
        knownProductCodes: ['A'],
      }),
    ).toThrow(OccurrenceSettlementPayerInvalidError)
  })

  test('qualquer tipo além de `driver` com `payerId` é `OccurrenceSettlementPayerInvalidError`', () => {
    for (const payerKind of ['carrier', 'contractor', 'insurer'] as const) {
      expect(() =>
        resolveOccurrenceSettlement({
          items: [
            {
              amount: '10.0000',
              amountSource: 'manual',
              payerId: '00000000-0000-4000-8000-000000000001',
              payerKind,
              productCode: 'A',
            },
          ],
          knownProductCodes: ['A'],
        }),
      ).toThrow(OccurrenceSettlementPayerInvalidError)
    }
  })

  test('`driver` com `payerId` presente passa', () => {
    const resolved = resolveOccurrenceSettlement({
      items: [
        {
          amount: '10.0000',
          amountSource: 'manual',
          payerId: '00000000-0000-4000-8000-000000000001',
          payerKind: 'driver',
          productCode: 'A',
        },
      ],
      knownProductCodes: ['A'],
    })
    expect(resolved.total).toBe('10.0000')
  })

  test('lista vazia soma zero, sem lançar', () => {
    const resolved = resolveOccurrenceSettlement({ items: [], knownProductCodes: ['A'] })
    expect(resolved.total).toBe('0.0000')
    expect(resolved.items).toEqual([])
  })

  test('só grava com `decided`/`goods_paid` — qualquer outra combinação recusa', () => {
    expect(isOccurrenceSettlementWritable({ decisionKind: 'goods_paid', status: 'decided' })).toBe(
      true,
    )
    expect(
      isOccurrenceSettlementWritable({ decisionKind: 'redelivery_authorized', status: 'decided' }),
    ).toBe(false)
    expect(isOccurrenceSettlementWritable({ decisionKind: 'goods_paid', status: 'closed' })).toBe(
      false,
    )
    expect(isOccurrenceSettlementWritable({ decisionKind: null, status: 'decided' })).toBe(false)
  })
})
