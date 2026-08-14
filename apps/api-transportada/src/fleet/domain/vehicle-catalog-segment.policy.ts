/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleRole, MdfeWheelType } from '../../database/fleet.schema.js'

const CAR_WHEEL_TYPES: readonly MdfeWheelType[] = ['04', '05']
const TRUCK_WHEEL_TYPES: readonly MdfeWheelType[] = ['01', '02', '03', '06']

export type VehicleCatalogSegment = 'caminhoes' | 'carros' | 'none'

export type ResolveVehicleCatalogSegmentInput = {
  readonly role: FleetVehicleRole
  readonly wheelType: MdfeWheelType | ''
}

/** Rodado → segmento do provedor FIPE; combinação sem cobertura devolve `none`, nunca lança. */
export function resolveVehicleCatalogSegment(
  input: ResolveVehicleCatalogSegmentInput,
): VehicleCatalogSegment {
  if (input.role === 'trailer') return 'none'
  if (CAR_WHEEL_TYPES.includes(input.wheelType as MdfeWheelType)) return 'carros'
  if (TRUCK_WHEEL_TYPES.includes(input.wheelType as MdfeWheelType)) return 'caminhoes'
  return 'none'
}
