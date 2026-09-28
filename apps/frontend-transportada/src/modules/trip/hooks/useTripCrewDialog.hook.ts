/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import type { TripDetail } from '../shared/trip.types'
import { resolveBoundVehicleIds } from '../shared/driverBoundVehicles.service'
import {
  resolveCrewDialogErrorKey,
  type CrewDialogErrorKey,
} from '../shared/tripCrewDialog.service'
import { useDriverVehicleBindings } from './useDriverVehicleBindings.hook'

export type TripCrewDialogInput = Readonly<{
  isOpen: boolean
  onSubmit: (
    input: Readonly<{ driverIds: readonly string[]; vehicleId: string }>,
  ) => Promise<unknown>
  selectableDriverIds: readonly string[]
  selectableVehicleIds: readonly string[]
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

  /**
   * A chave da seleção de motoristas para a qual `vehicleId` já está sincronizado — reabrir o
   * diálogo com o par atual da viagem conta como sincronizado; só uma seleção **diferente** dessa
   * chave pode disparar a troca de veículo abaixo.
   */
  const boundDriverIdsKeyRef = useRef('')

  useEffect(() => {
    if (!input.isOpen) return
    const openDriverIds = tripRef.current.drivers.map((driver) => driver.driverId)
    setDriverIds(openDriverIds)
    /** Spec 217 (RF1): viagem `awaiting_crew` ainda sem veículo — reabre sem escolha, não com `null`. */
    setVehicleId(tripRef.current.vehicleId ?? '')
    setErrorKey(undefined)
    boundDriverIdsKeyRef.current = openDriverIds.join('|')
  }, [input.isOpen, input.trip.id])

  const bindings = useDriverVehicleBindings({
    enabled: input.isOpen,
    selectableDriverIds: input.selectableDriverIds,
    selectedDriverIds: driverIds,
  })
  const [suggestedVehicleId] = resolveBoundVehicleIds({
    bindings,
    selectableVehicleIds: input.selectableVehicleIds,
    selectedDriverIds: driverIds,
  })

  /**
   * "A troca substitui a tripulação e o veículo inteiros" (`crewDialog.subtitle`): trocar o(s)
   * motorista(s) por um agregado com veículo próprio só troca o veículo junto quando o vínculo é
   * inequívoco (`resolveBoundVehicleIds`) — motorista sem veículo vinculado, ou com mais de um, não
   * decide pelo operador. A chave já sincronizada evita pisar numa escolha manual feita para a
   * mesma seleção de motoristas quando o vínculo chega depois (consulta em voo).
   */
  useEffect(() => {
    if (!input.isOpen) return
    const key = driverIds.join('|')
    if (key === boundDriverIdsKeyRef.current) return
    if (suggestedVehicleId === undefined) return
    boundDriverIdsKeyRef.current = key
    setVehicleId(suggestedVehicleId)
  }, [driverIds, input.isOpen, suggestedVehicleId])

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
