/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TRACTOR_UNIT_VEHICLE_TYPE, type VehicleType } from '../../shared/vehicle-type.constant.js'
import { FleetVehicleDefaultTrailerRequiresTractorError } from './fleet.error.js'

export type VehicleDefaultTrailerShape = {
  readonly defaultTrailerVehicleId: string | null
  readonly vehicleType: VehicleType | ''
}

/**
 * Feature 147 D3: a carreta padrão só faz sentido no cavalo — nos demais tipos o campo não se
 * aplica. Quem aponta para outra linha (existir na empresa, ser carreta ativa) é conferido no
 * caso de uso, porque exige consulta ao banco.
 */
export function checkVehicleDefaultTrailer(entry: VehicleDefaultTrailerShape): void {
  if (entry.defaultTrailerVehicleId !== null && entry.vehicleType !== TRACTOR_UNIT_VEHICLE_TYPE) {
    throw new FleetVehicleDefaultTrailerRequiresTractorError()
  }
}
