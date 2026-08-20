/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightVehicleClass } from '@/modules/shared/freightClass.constant'

import type { MdfeWheelType } from './fleet.types'

/**
 * O rodado do MDF-e e a classe da tabela de frete são listas diferentes: VUC e 3/4 não existem no
 * rodado, e "Cavalo mecânico" (`03`) e "Outros" (`06`) não nomeiam classe nenhuma. Só o que tem
 * tradução exata entra aqui — adivinhar o resto poria o veículo na linha errada da tabela.
 */
export const FREIGHT_CLASS_BY_WHEEL_TYPE: Readonly<
  Partial<Record<MdfeWheelType, FreightVehicleClass>>
> = {
  '01': 'truck',
  '02': 'toco',
  '04': 'van',
  '05': 'utility',
}

type SuggestFreightClassInput = Readonly<{
  current: '' | FreightVehicleClass
  nextWheelType: string
  previousWheelType: string
}>

function classOfWheelType(wheelType: string): '' | FreightVehicleClass {
  return FREIGHT_CLASS_BY_WHEEL_TYPE[wheelType as MdfeWheelType] ?? ''
}

/**
 * Sugerir é oferecer, não decidir: a classe escolhida à mão fica. O que a troca de rodado corrige é
 * a sugestão que ela mesma pôs — senão trocar `01` por `02` deixa "Truck" num toco, e o valor pago
 * ao motorista sai da linha errada da tabela de frete.
 */
export function suggestFreightClass(input: SuggestFreightClassInput): '' | FreightVehicleClass {
  const suggested = classOfWheelType(input.nextWheelType)
  if (input.current === '') return suggested
  return input.current === classOfWheelType(input.previousWheelType) ? suggested : input.current
}
