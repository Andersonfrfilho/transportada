/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isVehicleType, type VehicleType } from '@/modules/shared/vehicleType.constant'

import { EMPTY_VEHICLE_FORM } from './fleetForm.service'
import type { FleetVehicleFormState } from './fleet.types'

/**
 * Eixo que o próprio tipo do veículo já decide: moto, carro, utilitário, VAN, VUC, 3/4 e toco têm
 * dois, e truck tem três — perguntar de novo é pedir ao operador o que a lista de cima acabou de
 * dizer. Cavalo mecânico e "outro" ficam fora de propósito: 4x2 e 6x2 convivem na mesma frota, e
 * chutar um deles põe eixo errado no MDF-e sem ninguém ter decidido nada.
 */
const AXLE_COUNT_BY_VEHICLE_TYPE: Readonly<Partial<Record<VehicleType, string>>> = {
  car: '2',
  motorcycle: '2',
  three_quarter: '2',
  toco: '2',
  truck: '3',
  utility: '2',
  van: '2',
  vuc: '2',
}

export function resolveVehicleTypeAxleCount(vehicleType: string): string {
  if (!isVehicleType(vehicleType)) return ''
  return AXLE_COUNT_BY_VEHICLE_TYPE[vehicleType] ?? ''
}

/**
 * Só campo ainda em branco é alcançado, como na herança de marca: o operador que digitou quatro
 * eixos num truck 6x4 com terceiro eixo não pode ver o número voltar sozinho para três.
 */
export function resolveVehicleTypeDefaults(
  state: FleetVehicleFormState,
): Partial<FleetVehicleFormState> {
  if (state.axleCount !== EMPTY_VEHICLE_FORM.axleCount) return {}
  const axleCount = resolveVehicleTypeAxleCount(state.vehicleType)
  if (axleCount === '') return {}
  return { axleCount }
}
