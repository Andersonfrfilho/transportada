/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeWheelType } from '../database/fleet.schema.js'
import type { FreightVehicleClass } from './freight-class.constant.js'

/**
 * O que o veículo é, na única lista que o operador vê. Ela nasceu de dois campos vizinhos que
 * pediam a mesma coisa duas vezes — o rodado do MDF-e e a classe da tabela de frete —, e por isso
 * é a mais larga das duas: cabe o que a SEFAZ não nomeia (VUC, 3/4) e o que a tabela do cliente
 * não precifica (moto, carro, cavalo mecânico).
 *
 * Da mais leve para a mais pesada, que é a ordem das colunas da tabela de frete impressa.
 */
export const VEHICLE_TYPES = [
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

export type VehicleType = (typeof VEHICLE_TYPES)[number]

export const VEHICLE_TYPE_MAX_LENGTH = 20

/**
 * `tipoRodado` é lista fechada da SEFAZ, e `06 — Outros` é a saída que ela mesma publica. Todo tipo
 * que a tabela dela não nomeia vai por ali: recusar a emissão seria pior, e inventar `07` faz o
 * MDF-e ser rejeitado na transmissão.
 */
const WHEEL_TYPE_BY_VEHICLE_TYPE: Readonly<Record<VehicleType, MdfeWheelType>> = {
  car: '06',
  motorcycle: '06',
  other: '06',
  three_quarter: '06',
  toco: '02',
  tractor_unit: '03',
  truck: '01',
  utility: '05',
  van: '04',
  vuc: '06',
}

/**
 * A classe é a coluna da tabela de frete, e a tabela do cliente tem seis. Moto, carro e cavalo
 * mecânico não são coluna nenhuma — o agregado nesses veículos não é pago por essa tabela —, e
 * inventar coluna para eles poria valor de pagamento onde ninguém decidiu nenhum.
 */
const FREIGHT_CLASS_BY_VEHICLE_TYPE: Readonly<Record<VehicleType, '' | FreightVehicleClass>> = {
  car: '',
  motorcycle: '',
  other: '',
  three_quarter: 'three_quarter',
  toco: 'toco',
  tractor_unit: '',
  truck: 'truck',
  utility: 'utility',
  van: 'van',
  vuc: 'vuc',
}

export function resolveMdfeWheelType(vehicleType: VehicleType | ''): MdfeWheelType | '' {
  if (vehicleType === '') return ''
  return WHEEL_TYPE_BY_VEHICLE_TYPE[vehicleType]
}

export function resolveVehicleFreightClass(
  vehicleType: VehicleType | '',
): '' | FreightVehicleClass {
  if (vehicleType === '') return ''
  return FREIGHT_CLASS_BY_VEHICLE_TYPE[vehicleType]
}
