/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  formatOccurrenceSettlementAmount,
  isPositiveDecimalAmount,
  sumOccurrenceSettlementAmounts,
} from '@/modules/trip/shared/occurrenceSettlementMoney.service'

const PANEL = new URL(
  '../../src/modules/trip/components/OccurrenceSettlementPanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 164 T23 (RF34): dinheiro nunca em float no cliente — soma e formatação passam por `BigInt`
 * escalado (`occurrenceSettlementMoney.service.ts`), nunca `parseFloat`/`number` na conta.
 */
describe('spec 164 T23: dinheiro do acerto', () => {
  test('a soma nunca usa float — dez centavos dez vezes bate exato', () => {
    const amounts = Array.from({ length: 10 }, () => '0.10')
    expect(sumOccurrenceSettlementAmounts(amounts)).toBe('1.0000')
  })

  test('item sem valor (vazio) conta como zero na soma', () => {
    expect(sumOccurrenceSettlementAmounts(['10.50', '', '5.25'])).toBe('15.7500')
  })

  test('valor zero ou negativo não é positivo — item assim não entra no envio', () => {
    expect(isPositiveDecimalAmount('0')).toBeFalse()
    expect(isPositiveDecimalAmount('0.0000')).toBeFalse()
    expect(isPositiveDecimalAmount('-1')).toBeFalse()
    expect(isPositiveDecimalAmount('')).toBeFalse()
    expect(isPositiveDecimalAmount('1.50')).toBeTrue()
  })

  test('a formatação pt-BR sai em Real, a partir do decimal', () => {
    expect(formatOccurrenceSettlementAmount('1234.50')).toBe('R$ 1.234,50')
  })
})

describe('spec 164 T23 (RF34): painel de acerto', () => {
  test('item sem valor não é enviado — o filtro do envio exige valor positivo e código', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('isPositiveDecimalAmount(row.amount)')
    expect(panel).toContain('row.productCode.trim().length > 0')
  })

  test('transportadora (carrier) esconde o botão de ressarcimento, nunca oferece para dar 422', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("item.payerKind === 'carrier' ? null :")
  })

  test('amountSource é sempre manual — esta tela não tem de onde ler o valor da nota', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("amountSource: 'manual'")
  })

  test('usa Select/Button/Icon do design system para o seletor de pagador', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("from '@/components/ui/select'")
    expect(panel).toContain("from '@/components/ui/button'")
    expect(panel).not.toMatch(/<select[\s>]/u)
  })
})
