/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { EMPTY_VEHICLE_FORM, toVehicleBody } from '@/modules/fleet/shared/fleetForm.service'
import {
  CARGO_DIMENSION_KEYS,
  deriveCapacityCubicMeters,
  hasCargoDimensions,
  resolveSubmittedCapacity,
} from '@/modules/fleet/shared/vehicleCargoDimensions.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** O baú da 088: 8,90 × 2,50 × 2,70 — o mesmo caminhão que a spec usa para falar em metros. */
const MEASURED = {
  cargoHeightMeters: '2,70',
  cargoLengthMeters: '8,90',
  cargoWidthMeters: '2,50',
} as const

describe('Vehicle cargo dimensions', () => {
  test('the three measurements are what the tape gives, in the order it gives them', () => {
    expect(CARGO_DIMENSION_KEYS).toEqual([
      'cargoLengthMeters',
      'cargoWidthMeters',
      'cargoHeightMeters',
    ])
    expect(EMPTY_VEHICLE_FORM.cargoLengthMeters).toBe('')
    expect(EMPTY_VEHICLE_FORM.cargoWidthMeters).toBe('')
    expect(EMPTY_VEHICLE_FORM.cargoHeightMeters).toBe('')
  })

  test('a measurement short of three is not a volume', () => {
    expect(hasCargoDimensions(MEASURED)).toBe(true)
    expect(deriveCapacityCubicMeters(MEASURED)).toBe('60,08')

    for (const key of CARGO_DIMENSION_KEYS) {
      const partial = { ...MEASURED, [key]: '' }
      expect(hasCargoDimensions(partial)).toBe(false)
      /** Ausência, nunca zero: zero anunciaria um baú que não carrega nada. */
      expect(deriveCapacityCubicMeters(partial)).toBe('')
    }
  })

  test('a zeroed measurement is absence, not a wall of no thickness', () => {
    expect(hasCargoDimensions({ ...MEASURED, cargoWidthMeters: '0,00' })).toBe(false)
  })

  test('the typed capacity is dropped once the box is measured', () => {
    expect(resolveSubmittedCapacity({ ...MEASURED, capacityCubicMeters: '90,00' })).toBe('')
  })

  test('without the three measurements the typed capacity survives untouched', () => {
    const partial = { ...MEASURED, cargoHeightMeters: '', capacityCubicMeters: '90,00' }
    expect(resolveSubmittedCapacity(partial)).toBe('90,00')
  })

  /**
   * O defeito que esta task veio fechar: com o campo travado na tela, o m³ antigo continuava sendo
   * submetido por baixo dele e ficava no banco esperando alguém apagar as medidas para voltar a
   * valer sem ter sido reafirmado.
   */
  test('the submitted body carries zero capacity when the dimensions describe the box', () => {
    const body = toVehicleBody({ ...EMPTY_VEHICLE_FORM, ...MEASURED, capacityCubicMeters: '90,00' })

    expect(body.capacityCubicMeters).toBe('0.00')
    expect(body.cargoLengthMeters).toBe('8.90')
    expect(body.cargoWidthMeters).toBe('2.50')
    expect(body.cargoHeightMeters).toBe('2.70')
  })

  test('the submitted body keeps the typed capacity while the box is unmeasured', () => {
    const body = toVehicleBody({ ...EMPTY_VEHICLE_FORM, capacityCubicMeters: '90,00' })

    expect(body.capacityCubicMeters).toBe('90.00')
    expect(body.cargoLengthMeters).toBe('0.00')
  })

  test('the capacity field stops accepting typing once the box is measured', async () => {
    const source = await readApplicationFile(
      'src/modules/fleet/components/VehicleOperationFields.component.tsx',
    )

    expect(source).toContain('readOnly={isCapacityDerived}')
    expect(source).toContain('hasCargoDimensions(state)')
    /** Travar o campo sem mostrar o derivado deixaria a tela com o número que ninguém mais usa. */
    expect(source).toContain('isCapacityDerived ? derivedCapacity : state.capacityCubicMeters')
  })
})
