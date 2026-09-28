/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import type { TripDetail } from '../shared/trip.types'
import {
  resolveCrewDialogErrorKey,
  type CrewDialogErrorKey,
} from '../shared/tripCrewDialog.service'

export type TripCrewDialogInput = Readonly<{
  isOpen: boolean
  onSubmit: (
    input: Readonly<{ driverIds: readonly string[]; vehicleId: string }>,
  ) => Promise<unknown>
  trip: TripDetail
}>

export type TripCrewDialogController = ReturnType<typeof useTripCrewDialog>

/**
 * Spec 217 T310: estado do diálogo "Trocar motorista/veículo" — a tela só declara e renderiza; a
 * ordem de escolha vira a ordem da tripulação (posição), e o rascunho reabre com o par atual da
 * viagem sempre que o diálogo abre.
 */
export function useTripCrewDialog(input: TripCrewDialogInput) {
  const [driverIds, setDriverIds] = useState<readonly string[]>([])
  const [vehicleId, setVehicleId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<CrewDialogErrorKey | undefined>(undefined)

  /**
   * `input.trip` é reconstruído a cada resposta da consulta — dependê-lo faria o rascunho ser
   * pisado a cada refetch enquanto o diálogo está aberto (mesmo risco documentado em
   * `useDeliveryAddressOverrideDialog.hook.ts`). A referência guarda a viagem corrente sem entrar
   * na identidade do efeito; só `isOpen`/`trip.id` decidem quando reabrir o rascunho.
   */
  const tripRef = useRef(input.trip)
  tripRef.current = input.trip

  useEffect(() => {
    if (!input.isOpen) return
    setDriverIds(tripRef.current.drivers.map((driver) => driver.driverId))
    /** Spec 217 (RF1): viagem `awaiting_crew` ainda sem veículo — reabre sem escolha, não com `null`. */
    setVehicleId(tripRef.current.vehicleId ?? '')
    setErrorKey(undefined)
  }, [input.isOpen, input.trip.id])

  async function submit(): Promise<boolean> {
    setErrorKey(undefined)
    setIsSubmitting(true)
    try {
      await input.onSubmit({ driverIds, vehicleId })
      return true
    } catch (error) {
      setErrorKey(resolveCrewDialogErrorKey(error))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  return { driverIds, errorKey, isSubmitting, setDriverIds, setVehicleId, submit, vehicleId }
}
