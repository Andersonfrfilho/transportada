/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseTollBoothCharge } from '../../src/toll-booths/domain/toll-booth-charge.policy.js'

describe('toll booth charge policy (spec 090, T2)', () => {
  test('decompoe motorcar e hgv/axle da mesma tarifa', () => {
    const charge = '10.50BRL/motorcar;5.30BRL/motorcycle;10.50BRL/hgv/axle'

    expect(parseTollBoothCharge(charge)).toEqual({ chargeCar: '10.50', chargePerAxle: '10.50' })
  })

  /** Uma das 163 praças com tarifa no extract real declara só `hgv`, sem `/axle`. */
  test('hgv sem /axle nao vira charge_per_axle', () => {
    const charge = '11.60BRL/motorcar;5.80BRL/motorcycle;11.60BRL/hgv'

    expect(parseTollBoothCharge(charge)).toEqual({ chargeCar: '11.60', chargePerAxle: null })
  })

  test('praca sem charge tem as duas tarifas nulas, nunca descartada', () => {
    expect(parseTollBoothCharge(undefined)).toEqual({ chargeCar: null, chargePerAxle: null })
    expect(parseTollBoothCharge('')).toEqual({ chargeCar: null, chargePerAxle: null })
  })

  test('classe de veiculo desconhecida e ignorada, sem quebrar as demais', () => {
    const charge = '8.80BRL/motorcar;3.20BRL/bus;8.80BRL/hgv/axle'

    expect(parseTollBoothCharge(charge)).toEqual({ chargeCar: '8.80', chargePerAxle: '8.80' })
  })

  test('ordem dos segmentos nao importa', () => {
    const charge = '9.70BRL/hgv/axle;0.00BRL/motorcycle;9.70BRL/motorcar'

    expect(parseTollBoothCharge(charge)).toEqual({ chargeCar: '9.70', chargePerAxle: '9.70' })
  })
})
