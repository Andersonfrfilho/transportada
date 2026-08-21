/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeWheelType } from '../database/fleet.schema.js'

/**
 * Classe comercial do veículo — as seis colunas da tabela de frete.
 *
 * ⚠️ Não confundir com `tipoRodado` (`MdfeWheelType`), que é código da SEFAZ e vai para dentro do
 * XML do MDF-e. A tabela da SEFAZ não tem VUC/VLC nem 3/4, e inventar `07`/`08` lá faz o documento
 * ser rejeitado na transmissão. As duas convivem: o rodado descreve o eixo, a classe descreve o
 * que se paga.
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

/**
 * O que as duas tabelas dizem igual. Cavalo mecânico (`03`) e "Outros" (`06`) ficam de fora de
 * propósito: é onde o VUC e o 3/4 se escondem hoje, e escolher por eles poria valor de pagamento
 * errado no cadastro sem ninguém saber.
 */
const CLASS_BY_WHEEL_TYPE: Readonly<Partial<Record<MdfeWheelType, FreightVehicleClass>>> = {
  '01': 'truck',
  '02': 'toco',
  '04': 'van',
  '05': 'utility',
}

export function resolveVehicleFreightClass(
  wheelType: MdfeWheelType | '',
): '' | FreightVehicleClass {
  if (wheelType === '') return ''
  return CLASS_BY_WHEEL_TYPE[wheelType] ?? ''
}
