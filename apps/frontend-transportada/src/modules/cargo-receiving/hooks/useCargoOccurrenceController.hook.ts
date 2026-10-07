/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoArrivalDocument, CargoArrivalSummary } from '../shared/cargoArrival.types'
import { isOccurrenceWindowOpen, resolveCargoNoteActions } from '../shared/cargoNoteActions.service'
import {
  useCargoOccurrenceView,
  type CargoOccurrenceViewController,
} from './useCargoOccurrenceView.hook'
import type { CargoOccurrenceController, OpenedOccurrenceForm } from './useCargoOccurrence.hook'
import { useCargoReturnActions } from './useCargoReturnActions.hook'

export type CargoOccurrenceControllerInput = Readonly<{
  arrival: Pick<CargoArrivalSummary, 'id' | 'separationDueAt' | 'status'>
  canManage: boolean
  canResolve: boolean
}>

function buildNoteOf(input: {
  controllerInput: CargoOccurrenceControllerInput
  now: number
  view: CargoOccurrenceViewController
}): CargoOccurrenceController['noteOf'] {
  const { arrival, canManage, canResolve } = input.controllerInput
  return (document: CargoArrivalDocument) => {
    const marker = input.view.returns.get(document.nfeDocumentId)
    const occurrences = input.view.occurrencesOf(document.nfeDocumentId)
    const returnState = marker?.returnToContractor ?? 'none'
    const actions = resolveCargoNoteActions({
      arrivalStatus: arrival.status,
      canManage,
      canResolve,
      document,
      now: input.now,
      occurrences,
      returnOccurrenceId: marker?.returnOccurrenceId ?? null,
      returnState,
      separationDueAt: arrival.separationDueAt,
    })
    return { actions, occurrences, returnState }
  }
}

/** A chegada aberta com as suas avarias: a leitura, o gesto de devolver, o formulário aberto e a vez de cada nota. */
export function useCargoOccurrenceController(
  input: CargoOccurrenceControllerInput,
): CargoOccurrenceController {
  const view = useCargoOccurrenceView({ arrivalId: input.arrival.id, status: input.arrival.status })
  const returnActions = useCargoReturnActions(input.arrival.id)
  const [form, setForm] = useState<OpenedOccurrenceForm | undefined>(undefined)
  const now = Date.now()

  return {
    arrival: input.arrival,
    canManage: input.canManage,
    canResolve: input.canResolve,
    closeForm: () => setForm(undefined),
    form,
    hasFailed: view.hasFailed,
    isWindowClosed:
      input.canManage &&
      input.arrival.status === 'open' &&
      !isOccurrenceWindowOpen({ now, separationDueAt: input.arrival.separationDueAt }),
    noteOf: buildNoteOf({ controllerInput: input, now, view }),
    occurrences: view.occurrences,
    openForm: (document) =>
      setForm({ documentId: document.nfeDocumentId, number: document.number }),
    returnActions,
    returnCounts: view.returnCounts,
    returns: view.returns,
  }
}
