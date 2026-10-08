/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import type { FleetDriverListItem } from '@/modules/fleet/shared/fleet.types'

import type { TripDetail } from '../shared/trip.types'
import {
  listDriverCandidates,
  listHelperCandidates,
  readTripDriverIds,
  readTripHelperIds,
  withoutSelectedDrivers,
} from '../shared/tripCrewHelpers.service'
import {
  buildTransferTripCrewInput,
  readCurrentMembers,
  resolveCrewTransferBlocker,
  resolveCrewTransferErrorKey,
  resolveCrewTransferOutcome,
  summarizeCrewChange,
  type CrewTransferErrorKey,
  type CrewTransferOutcome,
} from '../shared/tripCrewTransfer.service'
import type { CrewTransferResult } from '../shared/tripCrewTransfer.types'

export type TripCrewTransferDialogInput = Readonly<{
  drivers: readonly FleetDriverListItem[]
  isOpen: boolean
  onSubmit: (
    input: Readonly<{
      driverIds: readonly string[]
      helperIds: readonly string[]
      reason: string
    }>,
  ) => Promise<CrewTransferResult>
  trip: TripDetail
}>

/**
 * Spec 249 T2.2: estado do diálogo "Transferir tripulação". Reabre com a tripulação atual, não
 * tem veículo (D2) e, depois da troca, guarda o resumo de custo para a tela dizer o que mudou.
 */
export function useTripCrewTransferDialog(input: TripCrewTransferDialogInput) {
  const [driverIds, setDriverIds] = useState<readonly string[]>([])
  const [helperIds, setHelperIds] = useState<readonly string[]>([])
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<CrewTransferErrorKey | undefined>(undefined)
  const [outcome, setOutcome] = useState<CrewTransferOutcome | undefined>(undefined)

  /** `input.trip` muda a cada refetch; só `isOpen`/`trip.id` decidem quando o rascunho recomeça. */
  const tripRef = useRef(input.trip)
  tripRef.current = input.trip

  useEffect(() => {
    if (!input.isOpen) return
    setDriverIds(readTripDriverIds(tripRef.current))
    setHelperIds(readTripHelperIds(tripRef.current))
    setReason('')
    setErrorKey(undefined)
    setOutcome(undefined)
  }, [input.isOpen, input.trip.id])

  const currentDriverIds = readTripDriverIds(input.trip)
  const currentHelperIds = readTripHelperIds(input.trip)
  const driverCandidates = listDriverCandidates({ currentDriverIds, drivers: input.drivers })
  const helperCandidates = listHelperCandidates({
    currentHelperIds,
    driverIds,
    drivers: input.drivers,
  })
  const blocker = resolveCrewTransferBlocker({
    currentDriverIds,
    currentHelperIds,
    driverIds,
    helperIds,
    reason,
    selectableDriverIds: driverCandidates.map((driver) => driver.id),
  })
  const summary = summarizeCrewChange({
    drivers: input.drivers,
    nextDriverIds: driverIds,
    nextHelperIds: helperIds,
    trip: input.trip,
  })

  async function submit(): Promise<boolean> {
    if (blocker !== undefined) return false
    setErrorKey(undefined)
    setIsSubmitting(true)
    try {
      const {
        driverIds: nextDriverIds,
        helperIds: nextHelperIds,
        reason: nextReason,
      } = buildTransferTripCrewInput({ driverIds, helperIds, reason, tripId: input.trip.id })
      const result = await input.onSubmit({
        driverIds: nextDriverIds,
        helperIds: nextHelperIds,
        reason: nextReason,
      })
      setOutcome(resolveCrewTransferOutcome(result.transfer))
      return true
    } catch (error) {
      setErrorKey(resolveCrewTransferErrorKey(error))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Quem passa a dirigir deixa de ser ajudante: a mesma pessoa não ocupa dois lugares. */
  function handleDriverIdsChange(nextDriverIds: readonly string[]): void {
    setDriverIds(nextDriverIds)
    setHelperIds((current) =>
      withoutSelectedDrivers({ driverIds: nextDriverIds, helperIds: current }),
    )
  }

  return {
    blocker,
    canSubmit: blocker === undefined && !isSubmitting,
    currentMembers: readCurrentMembers(input.trip),
    driverCandidates,
    driverIds,
    errorKey,
    helperCandidates,
    hasChanges: summary.entering.length > 0 || summary.leaving.length > 0,
    helperIds,
    isSubmitting,
    outcome,
    reason,
    setDriverIds: handleDriverIdsChange,
    setHelperIds,
    setReason,
    submit,
    summary,
  }
}
