/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriver, FleetVehicle } from '../application/fleet.port.js'

/**
 * Veículo próprio da transportadora não tem dono cadastrado; agregado e terceiro têm. O motorista
 * autônomo aparece ali pelo CPF ou pelo CNPJ que ele vinculou ao cadastro.
 */
export function isVehicleOwnedByDriver(input: {
  readonly driver: FleetDriver
  readonly vehicle: FleetVehicle
}): boolean {
  const ownerTaxId = input.vehicle.owner?.taxId ?? ''
  if (ownerTaxId === '') return false

  return ownerTaxId === input.driver.taxId || ownerTaxId === input.driver.linkedTaxId
}
