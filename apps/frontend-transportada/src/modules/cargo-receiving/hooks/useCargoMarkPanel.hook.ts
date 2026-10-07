/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'

export type CargoMarkPanelController = Readonly<{
  note: string
  occurrenceId: string
  setNote: (note: string) => void
  setOccurrenceId: (occurrenceId: string) => void
}>

/** A avaria de origem já vem escolhida (a primeira da nota); a observação é opcional. */
export function useCargoMarkPanel(
  occurrences: readonly CargoOccurrenceView[],
): CargoMarkPanelController {
  const [occurrenceId, setOccurrenceId] = useState(occurrences[0]?.id ?? '')
  const [note, setNote] = useState('')
  return { note, occurrenceId, setNote, setOccurrenceId }
}
