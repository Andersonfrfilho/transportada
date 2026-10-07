/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { isCaseNoteRequired } from '../shared/cargoOccurrenceCase.service'
import type {
  CargoCaseDecisionKind,
  ChangeCargoCaseInput,
} from '../shared/cargoOccurrenceCase.types'
import type { CargoCasePanelKind } from './useCargoCaseItem.hook'

export type CargoCasePanelFormController = Readonly<{
  buildChange: () => Omit<ChangeCargoCaseInput, 'occurrenceId'>
  decisionKind: CargoCaseDecisionKind
  isNoteMissing: boolean
  note: string
  setDecisionKind: (kind: CargoCaseDecisionKind) => void
  setNote: (note: string) => void
}>

/** O rascunho de UM painel aberto: nasce vazio a cada abertura. A decisão começa em `other`, a mais neutra. */
export function useCargoCasePanelForm(kind: CargoCasePanelKind): CargoCasePanelFormController {
  const [note, setNote] = useState('')
  const [decisionKind, setDecisionKind] = useState<CargoCaseDecisionKind>('other')
  const trimmed = note.trim()

  return {
    buildChange: () => ({
      action: kind,
      ...(kind === 'decide' ? { kind: decisionKind } : {}),
      ...(isCaseNoteRequired(kind) ? { note: trimmed } : {}),
    }),
    decisionKind,
    isNoteMissing: isCaseNoteRequired(kind) && trimmed === '',
    note,
    setDecisionKind,
    setNote,
  }
}
