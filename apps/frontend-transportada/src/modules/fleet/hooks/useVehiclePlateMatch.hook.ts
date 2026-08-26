/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { FleetVehicleDetail } from '../shared/fleet.types'
import { findVehicleWithSamePlate } from '../shared/vehiclePlateMatch.service'
import { getFleetClient } from './useFleet.hook'

/**
 * Spec 048, P2: a placa lida do documento é perguntada ao servidor, não à lista carregada na tela.
 * A tabela vem paginada e filtrada — um veículo fora da página em memória passaria despercebido, e o
 * operador só descobriria a duplicidade no `POST` recusado.
 */
export type VehiclePlateMatchController = Readonly<{
  dismiss: () => void
  find: (plate: string) => void
  match: FleetVehicleDetail | null
}>

const PLATE_LOOKUP_LIMIT = 10

export function useVehiclePlateMatch(): VehiclePlateMatchController {
  const [match, setMatch] = useState<FleetVehicleDetail | null>(null)

  function find(plate: string): void {
    setMatch(null)
    if (plate === '') return

    void getFleetClient()
      .listVehicles({ cursor: null, filters: { plateContains: plate }, limit: PLATE_LOOKUP_LIMIT })
      .then((page) => setMatch(findVehicleWithSamePlate(page.items, plate) ?? null))
      .catch(() => undefined)
  }

  return { dismiss: () => setMatch(null), find, match }
}
