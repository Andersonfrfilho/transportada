/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { VEHICLE_MEASURE_KEYS } from '@/modules/fleet/shared/fleet.constant'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { toVehicleBody, toVehicleFormState } from '@/modules/fleet/shared/fleetForm.service'
import {
  formatVehicleMeasure,
  VEHICLE_MEASURE_FIELD_SCALE,
} from '@/modules/fleet/shared/fleetVehicleMeasure.service'
import { VEHICLE_BRAND_DEFAULT_BLANK } from '@/modules/fleet/shared/vehicleBrandDefaults.service'
import { maskTypedMeasure, parseTypedMeasure } from '@/modules/shared/decimalAmount.service'

import { VEHICLE_DETAIL } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function buildVehicle(overrides: Partial<FleetVehicleDetail>): FleetVehicleDetail {
  return { ...(VEHICLE_DETAIL as FleetVehicleDetail), ...overrides }
}

describe('Vehicle measure fields', () => {
  test('mask types left to right, groups thousands and keeps a single comma', () => {
    expect(maskTypedMeasure({ scale: 2, value: '1493' })).toBe('1.493')
    expect(maskTypedMeasure({ scale: 2, value: '2007' })).toBe('2.007')
    expect(maskTypedMeasure({ scale: 2, value: '1493,5' })).toBe('1.493,5')
    expect(maskTypedMeasure({ scale: 2, value: '12,34' })).toBe('12,34')
    expect(maskTypedMeasure({ scale: 2, value: '0,5' })).toBe('0,5')
    expect(maskTypedMeasure({ scale: 2, value: '007' })).toBe('7')
    expect(maskTypedMeasure({ scale: 2, value: '' })).toBe('')
  })

  test('mask drops the extra comma, truncates to the scale and stays idempotent', () => {
    expect(maskTypedMeasure({ scale: 2, value: '12,3,4' })).toBe('12,34')
    expect(maskTypedMeasure({ scale: 2, value: '12,345' })).toBe('12,34')
    expect(maskTypedMeasure({ scale: 0, value: '12,3' })).toBe('123')
    expect(maskTypedMeasure({ scale: 2, value: 'abc' })).toBe('')

    const masked = maskTypedMeasure({ scale: 2, value: '1493,55' })
    expect(masked).toBe('1.493,55')
    expect(maskTypedMeasure({ scale: 2, value: masked })).toBe(masked)
  })

  /** O ponto agrupado é o milhar que a própria máscara pôs; lê-lo como decimal encolhe a carga. */
  test('parse reads the grouping dot as thousands, never as the decimal separator', () => {
    expect(parseTypedMeasure({ scale: 2, value: '1.493' })).toBe('1493.00')
    expect(parseTypedMeasure({ scale: 2, value: '1.493,5' })).toBe('1493.50')
    expect(parseTypedMeasure({ scale: 2, value: '27.000' })).toBe('27000.00')
    expect(parseTypedMeasure({ scale: 2, value: '7,5' })).toBe('7.50')
    expect(parseTypedMeasure({ scale: 2, value: '' })).toBe('0.00')
  })

  test('the three measures share the same scale on both sides of the wire', () => {
    expect([...VEHICLE_MEASURE_KEYS]).toEqual([
      'capacityCubicMeters',
      'capacityKilograms',
      'tareWeightKilograms',
    ])
    for (const key of VEHICLE_MEASURE_KEYS) {
      expect(VEHICLE_MEASURE_FIELD_SCALE[key]).toEqual({ api: 2, form: 2 })
    }
  })

  test('form state shows pt-BR and the body goes back to the API decimal', () => {
    const vehicle = buildVehicle({
      capacityCubicMeters: '90.50',
      capacityKilograms: '27000.00',
      tareWeightKilograms: '2007.25',
    })
    const state = toVehicleFormState(vehicle)

    expect(state.capacityCubicMeters).toBe('90,50')
    expect(state.capacityKilograms).toBe('27.000,00')
    expect(state.tareWeightKilograms).toBe('2.007,25')

    const body = toVehicleBody(state)
    expect(body.capacityCubicMeters).toBe('90.50')
    expect(body.capacityKilograms).toBe('27000.00')
    expect(body.tareWeightKilograms).toBe('2007.25')
  })

  /** Zero é "não informado": o campo abre vazio e volta zerado, sem fingir carga cadastrada. */
  test('zero opens the field blank and a blank field submits zero', () => {
    const state = toVehicleFormState(
      buildVehicle({
        capacityCubicMeters: '0.00',
        capacityKilograms: '0.00',
        tareWeightKilograms: '0.00',
      }),
    )

    expect(state.capacityKilograms).toBe('')
    expect(state.tareWeightKilograms).toBe('')
    expect(state.capacityCubicMeters).toBe('')

    const body = toVehicleBody(state)
    expect(body.capacityKilograms).toBe('0.00')
    expect(body.tareWeightKilograms).toBe('0.00')
    expect(body.capacityCubicMeters).toBe('0.00')

    for (const key of VEHICLE_MEASURE_KEYS) {
      expect(VEHICLE_BRAND_DEFAULT_BLANK[key]).toBe('')
    }
  })

  test('the listing formats the measure in pt-BR with its unit', () => {
    expect(formatVehicleMeasure({ unit: 'kg', value: '27000.00' })).toBe('27.000,00 kg')
    expect(formatVehicleMeasure({ unit: 'm³', value: '90.50' })).toBe('90,50 m³')
    expect(formatVehicleMeasure({ unit: 'kg', value: '0.00' })).toBe('')
  })

  test('the operation fields type through the measure mask, not through the digit filter', async () => {
    const fields = await readApplicationFile(
      'src/modules/fleet/components/VehicleOperationFields.component.tsx',
    )

    expect(fields).toContain('FleetMeasureField')
    expect(fields).toContain('VEHICLE_MEASURE_FIELD_SCALE.tareWeightKilograms.form')
    expect(fields).toContain('VEHICLE_MEASURE_FIELD_SCALE.capacityKilograms.form')
    expect(fields).toContain('VEHICLE_MEASURE_FIELD_SCALE.capacityCubicMeters.form')

    const field = await readApplicationFile('src/modules/fleet/components/FleetField.component.tsx')
    expect(field).toContain('maskTypedMeasure')
  })

  test('the response guard reads the three measures as decimal strings', async () => {
    const validation = await readApplicationFile(
      'src/modules/fleet/shared/fleetResponse.validation.ts',
    )

    expect(validation).toContain('isDecimalString(value.capacityCubicMeters)')
    expect(validation).toContain('isDecimalString(value.capacityKilograms)')
    expect(validation).toContain('isDecimalString(value.tareWeightKilograms)')
  })

  /** A planilha em pt-BR lê `27000.00` como texto: sem a vírgula a coluna deixa de somar. */
  test('the CSV writes the measures with a decimal comma', async () => {
    const exportService = await readApplicationFile(
      'src/modules/fleet/shared/vehicleSelectionExport.service.ts',
    )

    expect(exportService).toContain(
      "if (column === 'capacityKilograms') return toSpreadsheetDecimal(vehicle.capacityKilograms)",
    )
    expect(exportService).toContain(
      "if (column === 'tareWeightKilograms') return toSpreadsheetDecimal(vehicle.tareWeightKilograms)",
    )
  })
})
