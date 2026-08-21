/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { FREIGHT_VEHICLE_CLASSES } from '../../src/shared/freight-class.constant.js'
import {
  VEHICLE_TYPES,
  resolveMdfeWheelType,
  resolveVehicleFreightClass,
} from '../../src/shared/vehicle-type.constant.js'
import { MDFE_WHEEL_TYPES } from '../../src/database/fleet.schema.js'

describe('vehicle type catalog', () => {
  /**
   * O operador escolhe um campo só, e daí saem duas coisas com vocabulários diferentes: `tpRod` do
   * MDF-e e a coluna da tabela de frete. Tipo sem derivação é veículo que não emite ou não paga.
   */
  test('every type derives a wheel type and a freight class', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      const wheelType = resolveMdfeWheelType(vehicleType)
      expect(wheelType).not.toBe('')
      expect(MDFE_WHEEL_TYPES as readonly string[]).toContain(wheelType)

      const freightClass = resolveVehicleFreightClass(vehicleType)
      if (freightClass !== '') expect(FREIGHT_VEHICLE_CLASSES).toContain(freightClass)
    }
  })

  /** `tpRod` é lista fechada da SEFAZ: o que ela não nomeia entra como `06`, nunca como código novo. */
  test('a type the SEFAZ list does not name travels as 06', () => {
    for (const vehicleType of ['car', 'motorcycle', 'other', 'three_quarter', 'vuc'] as const) {
      expect(resolveMdfeWheelType(vehicleType)).toBe('06')
    }
  })

  test('the types the SEFAZ list does name keep their own code', () => {
    expect(resolveMdfeWheelType('truck')).toBe('01')
    expect(resolveMdfeWheelType('toco')).toBe('02')
    expect(resolveMdfeWheelType('tractor_unit')).toBe('03')
    expect(resolveMdfeWheelType('van')).toBe('04')
    expect(resolveMdfeWheelType('utility')).toBe('05')
  })

  /**
   * A classe é coluna da planilha do cliente, e o cabeçalho dela é congelado pelo parser do CSV:
   * moto, carro e cavalo mecânico não têm coluna, e inventar uma recusaria a planilha que hoje entra.
   */
  test('a type with no priced column has no freight class', () => {
    for (const vehicleType of ['car', 'motorcycle', 'other', 'tractor_unit'] as const) {
      expect(resolveVehicleFreightClass(vehicleType)).toBe('')
    }
  })

  test('the six priced types name their own column', () => {
    for (const freightClass of FREIGHT_VEHICLE_CLASSES) {
      expect(resolveVehicleFreightClass(freightClass)).toBe(freightClass)
    }
  })

  test('no type means no derivation on either side', () => {
    expect(resolveMdfeWheelType('')).toBe('')
    expect(resolveVehicleFreightClass('')).toBe('')
  })
})
