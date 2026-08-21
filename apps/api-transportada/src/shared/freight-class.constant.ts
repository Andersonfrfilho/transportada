/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Classe comercial do veículo — as seis colunas da tabela de frete, e nada além delas: o cabeçalho
 * do arquivo que o cliente exporta é esta lista, então acrescentar valor aqui recusa a planilha que
 * já roda hoje.
 *
 * ⚠️ Não é o que o operador escolhe no cadastro — lá o campo é `VEHICLE_TYPES`, mais largo, e a
 * classe sai dele por `resolveVehicleFreightClass`. Veículo que não é coluna desta tabela (moto,
 * carro, cavalo mecânico) tem classe vazia, e é assim que ele não recebe preço que ninguém decidiu.
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

export const FREIGHT_VEHICLE_CLASS_MAX_LENGTH = 20
