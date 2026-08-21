/* Copyright (c) 2026 Ada Technology. MIT License. */

/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * O que o veículo é, na única lista que o operador vê. Ela nasceu de dois campos vizinhos que
 * pediam a mesma coisa duas vezes — o rodado do MDF-e e a classe da tabela de frete —, e por isso é
 * a mais larga das duas: cabe o que a SEFAZ não nomeia (VUC, 3/4) e o que a tabela do cliente não
 * precifica (moto, carro, cavalo mecânico). O `tipoRodado` e a classe saem dela por derivação, na
 * API — cópia por valor da lista de `api-transportada/src/shared/vehicle-type.constant.ts`, porque
 * o bundle não carrega código da API.
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

export function isVehicleType(value: string): value is VehicleType {
  return (VEHICLE_TYPES as readonly string[]).includes(value)
}
