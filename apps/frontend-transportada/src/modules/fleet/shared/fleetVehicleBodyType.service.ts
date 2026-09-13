/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MDFE_BODY_TYPE, type FleetVehicleFormState, type MdfeBodyType } from './fleet.types'

const TRACTION_ROLE = 'traction'
const TRACTOR_UNIT_VEHICLE_TYPE = 'tractor_unit'
const NOT_APPLICABLE_BODY_TYPE = '00'

/** Feature 147 D1: `00` nunca é opção fora do cavalo — não é "não escolhida", é "não existe". */
export const VEHICLE_BODY_TYPE_OPTIONS: readonly MdfeBodyType[] = MDFE_BODY_TYPE.filter(
  (bodyType) => bodyType !== NOT_APPLICABLE_BODY_TYPE,
)

/**
 * Feature 147 D1: `00` só descreve o cavalo mecânico, que não carrega. Carreta (`role: 'trailer'`)
 * fica fora mesmo com um `vehicleType` esquecido de antes de trocar o papel — quem decide é o papel,
 * não o resíduo de um campo que a tela escondeu.
 */
export function isTractorUnitKind(
  input: Readonly<Pick<FleetVehicleFormState, 'role' | 'vehicleType'>>,
): boolean {
  return input.role === TRACTION_ROLE && input.vehicleType === TRACTOR_UNIT_VEHICLE_TYPE
}

/**
 * Feature 147 D1/RF2: virar cavalo força `00` (é o único valor que ele aceita); sair do cavalo
 * limpa para vazio, nunca herda `00` — o formulário volta a pedir a escolha, como um veículo novo.
 * Sem mudança de tipo, não devolve nada: ficha antiga com `00` num tipo que carrega não é reescrita
 * (D2) só porque o operador mexeu em outro campo.
 */
export function resolveVehicleBodyTypeForKindChange(
  input: Readonly<{
    next: Readonly<Pick<FleetVehicleFormState, 'role' | 'vehicleType'>>
    previous: Readonly<Pick<FleetVehicleFormState, 'role' | 'vehicleType'>>
  }>,
): Partial<FleetVehicleFormState> {
  const wasTractorUnit = isTractorUnitKind(input.previous)
  const isTractorUnitNow = isTractorUnitKind(input.next)
  if (wasTractorUnit === isTractorUnitNow) return {}
  return { bodyType: isTractorUnitNow ? NOT_APPLICABLE_BODY_TYPE : '' }
}

/**
 * Feature 147 RF1/RF2: bloqueia o envio antes do 400 da API. Cavalo nunca fica incompleto — o
 * campo nem aparece para ele, e o valor é sempre forçado por `resolveVehicleBodyTypeForKindChange`.
 * Fora do cavalo, `''` (nunca escolhido) e `'00'` (ficha antiga que ninguém tocou) contam igual: os
 * dois são ausência de carroceria, e só a ficha antiga já gravada continua existindo assim (D2).
 */
export function isVehicleBodyTypeMissing(
  input: Readonly<Pick<FleetVehicleFormState, 'bodyType' | 'role' | 'vehicleType'>>,
): boolean {
  if (isTractorUnitKind(input)) return false
  return input.bodyType === '' || input.bodyType === NOT_APPLICABLE_BODY_TYPE
}
