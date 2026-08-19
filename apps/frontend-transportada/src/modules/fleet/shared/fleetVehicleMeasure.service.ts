/* Copyright (c) 2026 Ada Technology. MIT License. */
import { parseTypedMeasure, toTypedMeasure } from '../../shared/decimalAmount.service'
import type { VEHICLE_MEASURE_KEYS } from './fleet.constant'

export type FleetVehicleMeasureKey = (typeof VEHICLE_MEASURE_KEYS)[number]

export type FleetVehicleMeasureFields = Readonly<Record<FleetVehicleMeasureKey, string>>

/** Duas casas dos dois lados do fio: a fração que o operador digita é a que o cadastro guarda. */
const MEASURE_SCALE = 2
const MEASURE_SCALES = { api: MEASURE_SCALE, form: MEASURE_SCALE } as const

export const VEHICLE_MEASURE_FIELD_SCALE: Readonly<
  Record<FleetVehicleMeasureKey, Readonly<{ api: number; form: number }>>
> = {
  capacityCubicMeters: MEASURE_SCALES,
  capacityKilograms: MEASURE_SCALES,
  tareWeightKilograms: MEASURE_SCALES,
}

/** Campo em branco vira zero na escala da API: é o que ela aceita para medida não informada. */
export function toVehicleMeasureBody(fields: FleetVehicleMeasureFields): FleetVehicleMeasureFields {
  return {
    capacityCubicMeters: toApiMeasure(fields, 'capacityCubicMeters'),
    capacityKilograms: toApiMeasure(fields, 'capacityKilograms'),
    tareWeightKilograms: toApiMeasure(fields, 'tareWeightKilograms'),
  }
}

export function toVehicleMeasureFormState(
  fields: FleetVehicleMeasureFields,
): FleetVehicleMeasureFields {
  return {
    capacityCubicMeters: toFormMeasure(fields, 'capacityCubicMeters'),
    capacityKilograms: toFormMeasure(fields, 'capacityKilograms'),
    tareWeightKilograms: toFormMeasure(fields, 'tareWeightKilograms'),
  }
}

/** Zero é "não informado": a célula fica vazia em vez de anunciar um veículo que não carrega nada. */
export function formatVehicleMeasure(input: Readonly<{ unit: string; value: string }>): string {
  const typed = toTypedMeasure({ scale: MEASURE_SCALE, value: input.value })

  return typed === '' ? '' : `${typed} ${input.unit}`
}

function toApiMeasure(fields: FleetVehicleMeasureFields, key: FleetVehicleMeasureKey): string {
  return parseTypedMeasure({ scale: VEHICLE_MEASURE_FIELD_SCALE[key].api, value: fields[key] })
}

function toFormMeasure(fields: FleetVehicleMeasureFields, key: FleetVehicleMeasureKey): string {
  return toTypedMeasure({ scale: VEHICLE_MEASURE_FIELD_SCALE[key].form, value: fields[key] })
}
