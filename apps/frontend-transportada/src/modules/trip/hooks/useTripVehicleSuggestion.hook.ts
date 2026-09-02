/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import { useDriverVehicles } from '@/modules/fleet/hooks/useDriverVehicles.hook'

import { resolveSuggestedVehicleId } from '../shared/vehicleSuggestion.service'
import type { TripCreationController } from './useTripCreation.hook'

const SOLE = 1

/**
 * A regra de **quando** sugerir é pura e mora em `vehicleSuggestion.service.ts`, com contrato
 * próprio. Aqui fica só o que precisa do React: buscar os vínculos do motorista escolhido e
 * escrever o campo uma vez.
 *
 * A consulta só liga com **um** motorista escolhido — com dois não há sugestão possível, e pedir os
 * vínculos de qualquer jeito seria uma requisição por seleção do multi-select, sem consumidor.
 */
export function useTripVehicleSuggestion(
  input: Readonly<{
    companyId?: string
    creation: TripCreationController
    permissions: readonly string[]
    selectableVehicleIds: readonly string[]
  }>,
): void {
  const { creation } = input
  const [soleDriverId] = creation.draft.driverIds
  const driverId = creation.draft.driverIds.length === SOLE ? soleDriverId : undefined

  const driverVehicles = useDriverVehicles({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    ...(driverId === undefined ? {} : { driverId }),
    permissions: input.permissions,
  })

  const { links } = driverVehicles
  const { setVehicleId } = creation
  const currentVehicleId = creation.draft.vehicleId
  const driverIds = creation.draft.driverIds
  const { selectableVehicleIds } = input

  useEffect(() => {
    if (driverId === undefined) return

    const suggested = resolveSuggestedVehicleId({
      currentVehicleId,
      driverIds,
      driverVehicles: links,
      selectableVehicleIds,
    })
    if (suggested !== null) setVehicleId(suggested)
  }, [currentVehicleId, driverId, driverIds, links, selectableVehicleIds, setVehicleId])
}
