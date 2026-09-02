/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { describeTripVehicle } from '@/modules/trip/shared/vehicleSummary.service'

const COMPLETO = {
  brand: 'Renault',
  colorLabel: 'Branca',
  model: 'Master 2.5 dCi 16V 115cv',
  modelYear: '2021',
  plate: 'FFV2D95',
}

describe('identificação do veículo no detalhe da viagem', () => {
  test('a placa vem primeiro, e o resto confirma que é o caminhão certo', () => {
    expect(describeTripVehicle(COMPLETO)).toBe(
      'FFV2D95 · Renault Master 2.5 dCi 16V 115cv · 2021 · Branca',
    )
  })

  /**
   * O que a tela mostrava era o UUID: campo faltando não pode devolver a produzir string ilegível.
   * Parte vazia sai fora — separador solto esconde o que faltou.
   */
  test('veículo sem ano não imprime separador solto', () => {
    expect(describeTripVehicle({ ...COMPLETO, modelYear: '' })).toBe(
      'FFV2D95 · Renault Master 2.5 dCi 16V 115cv · Branca',
    )
  })

  /** Cor fora do catálogo fechado não tem rótulo traduzido; a linha continua legível sem ela. */
  test('veículo sem cor conhecida continua identificável', () => {
    expect(describeTripVehicle({ ...COMPLETO, colorLabel: '' })).toBe(
      'FFV2D95 · Renault Master 2.5 dCi 16V 115cv · 2021',
    )
  })

  test('só a placa ainda identifica o veículo', () => {
    expect(
      describeTripVehicle({
        brand: '',
        colorLabel: '',
        model: '',
        modelYear: '',
        plate: 'ABC1D23',
      }),
    ).toBe('ABC1D23')
  })

  /** Espaço em volta vem do cadastro digitado à mão e não pode virar separador duplicado. */
  test('espaço em volta não vira separador', () => {
    expect(describeTripVehicle({ ...COMPLETO, brand: '  Renault  ', model: ' Master ' })).toBe(
      'FFV2D95 · Renault Master · 2021 · Branca',
    )
  })
})
