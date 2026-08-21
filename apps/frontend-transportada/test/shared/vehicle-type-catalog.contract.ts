/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { VEHICLE_TYPES, isVehicleType } from '@/modules/shared/vehicleType.constant'

/**
 * O bundle não carrega código da API: a lista é reescrita aqui, e o que garante que as duas dizem a
 * mesma coisa é esta asserção — a mesma disciplina de `fuel-catalog.contract.ts`. A ordem faz parte
 * do contrato: ela é a das colunas da tabela de frete impressa, da mais leve para a mais pesada.
 */
const CATALOG = [
  'motorcycle',
  'car',
  'utility',
  'van',
  'vuc',
  'three_quarter',
  'toco',
  'truck',
  'tractor_unit',
  'other',
] as const

describe('frontend vehicle type catalog', () => {
  test('matches the API catalog, in the same order', () => {
    expect(VEHICLE_TYPES).toEqual(CATALOG)
  })

  /**
   * Moto e carro entraram porque a frota real os tem, e o rodado do MDF-e não os nomeia: eles saem
   * como `06 — Outros` pela derivação da API. Sem eles o operador não cadastrava o veículo.
   */
  test('holds what the SEFAZ wheel type does not name', () => {
    for (const vehicleType of ['motorcycle', 'car', 'vuc', 'three_quarter', 'other']) {
      expect(isVehicleType(vehicleType)).toBe(true)
    }
  })

  test('rejects what is not in the catalog', () => {
    for (const value of ['', '01', 'bitrem', 'Truck']) {
      expect(isVehicleType(value)).toBe(false)
    }
  })
})
