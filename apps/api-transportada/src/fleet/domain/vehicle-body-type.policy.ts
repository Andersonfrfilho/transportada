/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleRole, MdfeBodyType } from '../../database/fleet.schema.js'
import { TRACTOR_UNIT_VEHICLE_TYPE, type VehicleType } from '../../shared/vehicle-type.constant.js'
import {
  FleetVehicleBodyTypeNotApplicableError,
  FleetVehicleBodyTypeRequiredError,
} from './fleet.error.js'

const TRACTION_ROLE: FleetVehicleRole = 'traction'
const NOT_APPLICABLE_BODY_TYPE: MdfeBodyType = '00'

export type VehicleBodyTypeShape = {
  readonly bodyType: MdfeBodyType
  readonly role: FleetVehicleRole
  readonly vehicleType: VehicleType | ''
}

/**
 * Feature 147 D1: `00` só descreve o cavalo, que não carrega — quem carrega escolhe carroceria.
 * Cavalo é `role: 'traction'` com `vehicleType: 'tractor_unit'`; toda carreta (`role: 'trailer'`,
 * `vehicleType: ''`) cai do lado que exige escolha, junto dos demais tipos que tracionam.
 */
export function checkVehicleBodyType(entry: VehicleBodyTypeShape): void {
  const isTractorUnit =
    entry.role === TRACTION_ROLE && entry.vehicleType === TRACTOR_UNIT_VEHICLE_TYPE
  if (entry.bodyType === NOT_APPLICABLE_BODY_TYPE && !isTractorUnit) {
    throw new FleetVehicleBodyTypeRequiredError()
  }
  if (entry.bodyType !== NOT_APPLICABLE_BODY_TYPE && isTractorUnit) {
    throw new FleetVehicleBodyTypeNotApplicableError()
  }
}
