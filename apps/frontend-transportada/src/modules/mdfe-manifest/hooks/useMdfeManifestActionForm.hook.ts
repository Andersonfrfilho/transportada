/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { MdfeAttemptKind, MdfeManifestSummary } from '../shared/mdfeManifest.types'
import {
  validateCancellationJustification,
  validateClosure,
} from '../shared/mdfeManifestActions.service'

export type MdfeManifestPendingAction = null | Readonly<{
  kind: MdfeAttemptKind
  manifest: MdfeManifestSummary
}>

export type MdfeManifestActionFormController = ReturnType<typeof useMdfeManifestActionForm>

export function useMdfeManifestActionForm() {
  const [pendingAction, setPendingAction] = useState<MdfeManifestPendingAction>(null)
  const [closureCityCode, setClosureCityCode] = useState('')
  const [closureState, setClosureState] = useState('')
  const [justification, setJustification] = useState('')

  return {
    cancellationIssue: validateCancellationJustification(justification),
    closureCityCode,
    closureIssue: validateClosure({ closureCityCode, closureState }),
    closureState,
    dismiss: () => {
      setPendingAction(null)
      setClosureCityCode('')
      setClosureState('')
      setJustification('')
    },
    justification,
    openAction: (kind: MdfeAttemptKind, manifest: MdfeManifestSummary) =>
      setPendingAction({ kind, manifest }),
    pendingAction,
    setClosureCityCode,
    setClosureState,
    setJustification,
  }
}
