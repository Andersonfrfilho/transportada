/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleRole } from '../../database/fleet.schema.js'
import type { VehicleType } from '../../shared/vehicle-type.constant.js'

export type VehicleCatalogSegment = 'caminhoes' | 'carros' | 'motos' | 'none'

/**
 * A FIPE separa o catálogo em três tabelas, e é o tipo do veículo que diz qual delas tem a marca.
 * `other` cai em caminhões porque é o que a transportadora cadastra quando nada nomeia o veículo —
 * lista larga vale mais que lista vazia, e o campo tem saída manual de qualquer forma.
 */
const SEGMENT_BY_VEHICLE_TYPE: Readonly<Record<VehicleType, VehicleCatalogSegment>> = {
  car: 'carros',
  motorcycle: 'motos',
  other: 'caminhoes',
  three_quarter: 'caminhoes',
  toco: 'caminhoes',
  tractor_unit: 'caminhoes',
  truck: 'caminhoes',
  utility: 'carros',
  van: 'carros',
  vuc: 'caminhoes',
}

export type ResolveVehicleCatalogSegmentInput = {
  readonly role: FleetVehicleRole
  readonly vehicleType: VehicleType | ''
}

/** Tipo → segmento do provedor FIPE; combinação sem cobertura devolve `none`, nunca lança. */
export function resolveVehicleCatalogSegment(
  input: ResolveVehicleCatalogSegmentInput,
): VehicleCatalogSegment {
  if (input.role === 'trailer') return 'none'
  if (input.vehicleType === '') return 'none'
  return SEGMENT_BY_VEHICLE_TYPE[input.vehicleType]
}
