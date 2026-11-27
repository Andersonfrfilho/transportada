/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  buildPaidAmounts,
  maskPaidAmount,
  parsePaidAmount,
} from '@/modules/trip/shared/paidAmountField.service'

describe('o valor pago digitado na criação da viagem (spec 327)', () => {
  it('a máscara escreve em pt-BR e o corpo leva o decimal da API', () => {
    expect(maskPaidAmount('125000')).toBe('1.250,00')
    expect(parsePaidAmount('1.250,00')).toBe('1250.00')
  })

  it('vazio é "não informado", nunca zero', () => {
    expect(parsePaidAmount('')).toBeUndefined()
    expect(buildPaidAmounts({ crewIds: ['a'], inputs: { a: '' } })).toEqual({})
  })

  it('só quem está na tripulação leva valor', () => {
    expect(
      buildPaidAmounts({
        crewIds: ['a', 'b'],
        inputs: { a: '250,00', b: '', removed: '99,00' },
      }),
    ).toEqual({ a: '250.00' })
  })
})
