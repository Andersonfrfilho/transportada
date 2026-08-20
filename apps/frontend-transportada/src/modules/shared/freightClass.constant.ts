/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Do veículo mais leve ao mais pesado — é a ordem das colunas da tabela de frete impressa que o
 * cliente usa, e é por ela que o operador confere o valor linha a linha.
 */
export const FREIGHT_VEHICLE_CLASSES = [
  'utility',
  'van',
  'vuc',
  'three_quarter',
  'toco',
  'truck',
] as const

export type FreightVehicleClass = (typeof FREIGHT_VEHICLE_CLASSES)[number]

export function isFreightVehicleClass(value: string): value is FreightVehicleClass {
  return (FREIGHT_VEHICLE_CLASSES as readonly string[]).includes(value)
}
