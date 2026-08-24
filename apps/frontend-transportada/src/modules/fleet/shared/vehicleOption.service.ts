import { VEHICLE_COLOR_SWATCH } from './fleet.constant'
import { VEHICLE_COLOR, type VehicleColor } from './fleet.types'

/** Frota cadastrada antes da lista fechada guarda texto livre: não há tom para pintar "prata metálico". */
export function resolveVehicleColorSwatch(color: string): string | undefined {
  const known: VehicleColor | undefined = VEHICLE_COLOR.find((entry) => entry === color)
  return known === undefined ? undefined : VEHICLE_COLOR_SWATCH[known]
}

/**
 * A placa identifica o veículo; esta linha é o que faz escolher um em vez do outro. Parte vazia sai
 * fora em vez de virar separador solto — veículo sem modelo cadastrado mostraria " ·  · " e ninguém
 * saberia o que faltou.
 */
export function buildVehicleOptionDescription(
  input: Readonly<{ brand: string; colorLabel: string; model: string; ownershipLabel: string }>,
): string {
  const nameParts = [input.brand, input.model]
    .map((part) => part.trim())
    .filter((part) => part !== '')

  return [input.ownershipLabel, nameParts.join(' '), input.colorLabel]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' · ')
}
