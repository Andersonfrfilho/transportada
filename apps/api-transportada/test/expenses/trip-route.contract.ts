/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 (trajeto da viagem no pagamento): o trajeto sai do rótulo da primeira e da última parada, só cidade.
 */
import { describe, expect, it } from 'bun:test'

import {
  deriveExpenseTripRoute,
  readStopLabelPlace,
} from '../../src/expenses/domain/expense-trip-route.policy.js'

describe('trajeto da viagem (rótulo das paradas)', () => {
  it('lê a cidade do rótulo "rua, número, cidade, UF"', () => {
    expect(readStopLabelPlace('RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP')).toBe('SAO CARLOS')
    expect(readStopLabelPlace('RUA X, SAO CARLOS, SP')).toBe('SAO CARLOS')
  })

  it('rótulo sem cidade e UF reconhecíveis volta inteiro, e o vazio não vira trajeto', () => {
    expect(readStopLabelPlace('Galpão central')).toBe('Galpão central')
    expect(readStopLabelPlace('   ')).toBeNull()
    expect(deriveExpenseTripRoute([])).toBeNull()
  })

  it('origem é a primeira parada e destino a última', () => {
    expect(
      deriveExpenseTripRoute([
        'RUA A, 1, RIBEIRAO PRETO, SP',
        'RUA B, 2, ARARAQUARA, SP',
        'RUA C, 3, CAMPINAS, SP',
      ]),
    ).toEqual({ destination: 'CAMPINAS', origin: 'RIBEIRAO PRETO' })
  })

  it('parada única, ou a mesma cidade nas duas pontas, fica só com o destino', () => {
    expect(deriveExpenseTripRoute(['RUA A, 1, CAMPINAS, SP'])).toEqual({
      destination: 'CAMPINAS',
      origin: null,
    })
    expect(deriveExpenseTripRoute(['RUA A, 1, CAMPINAS, SP', 'RUA B, 2, CAMPINAS, SP'])).toEqual({
      destination: 'CAMPINAS',
      origin: null,
    })
  })
})
