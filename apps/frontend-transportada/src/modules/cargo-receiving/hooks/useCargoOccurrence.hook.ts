/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext } from 'react'

import type { CargoArrivalDocument, CargoArrivalSummary } from '../shared/cargoArrival.types'
import type { CargoNoteActions } from '../shared/cargoNoteActions.service'
import type {
  CargoDocumentReturn,
  CargoOccurrenceView,
  CargoReturnState,
} from '../shared/cargoOccurrence.types'
import type { CargoReturnActionsController } from './useCargoReturnActions.hook'

export type CargoNoteView = Readonly<{
  actions: CargoNoteActions
  occurrences: readonly CargoOccurrenceView[]
  returnState: CargoReturnState
}>

export type OpenedOccurrenceForm = Readonly<{ documentId: string; number: string }>

export type CargoOccurrenceController = Readonly<{
  arrival: Pick<CargoArrivalSummary, 'id' | 'separationDueAt' | 'status'>
  canManage: boolean
  canResolve: boolean
  closeForm: () => void
  form: OpenedOccurrenceForm | undefined
  hasFailed: boolean
  /** O prazo de separação acabou: ninguém abre avaria nova nesta chegada (marcar e concluir seguem valendo). */
  isWindowClosed: boolean
  noteOf: (document: CargoArrivalDocument) => CargoNoteView
  occurrences: readonly CargoOccurrenceView[]
  openForm: (document: CargoArrivalDocument) => void
  returnActions: CargoReturnActionsController
  returnCounts: Readonly<{ marked: number; returned: number }>
  returns: ReadonlyMap<string, CargoDocumentReturn>
}>

export const CargoOccurrenceContext = createContext<CargoOccurrenceController | undefined>(
  undefined,
)

/** A avaria e a devolução da chegada aberta: cada nota lê dela o selo, as ações e o que falhou. */
export function useCargoOccurrence(): CargoOccurrenceController {
  const controller = useContext(CargoOccurrenceContext)
  if (controller === undefined) throw new Error('CARGO_OCCURRENCE_PROVIDER_MISSING')
  return controller
}
