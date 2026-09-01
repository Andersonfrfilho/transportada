/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { FleetVehicleDetail } from './fleet.types'
import { normalizePlate } from './fleetForm.service'

/**
 * Spec 048, P2: placa repetida é atualização, não cadastro novo. Sem isto o operador preenche a
 * ficha inteira para a unicidade recusar no `POST` — e o trabalho já foi feito.
 *
 * O filtro do servidor é `plateContains`, então ele devolve vizinhança: `GCQ8E4` casaria com dois
 * veículos. Quem decide é a igualdade exata, aqui.
 */
export function findVehicleWithSamePlate(
  vehicles: readonly FleetVehicleDetail[],
  plate: string,
): FleetVehicleDetail | undefined {
  const wanted = normalizePlate(plate)
  if (wanted === '') return undefined

  return vehicles.find((vehicle) => normalizePlate(vehicle.plate) === wanted)
}
