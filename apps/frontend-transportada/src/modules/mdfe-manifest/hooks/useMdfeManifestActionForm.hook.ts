/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { MdfeAttemptKind, MdfeManifestSummary } from '../shared/mdfeManifest.types'
import {
  validateCancellationJustification,
  validateClosure,
} from '../shared/mdfeManifestActions.service'

/** Descarte não é tentativa fiscal — não vai à SEFAZ, mas pede a mesma confirmação da tela. */
export type MdfeManifestActionKind = MdfeAttemptKind | 'discard'

export type MdfeManifestPendingAction = null | Readonly<{
  kind: MdfeManifestActionKind
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
    openAction: (kind: MdfeManifestActionKind, manifest: MdfeManifestSummary) =>
      setPendingAction({ kind, manifest }),
    pendingAction,
    setClosureCityCode,
    setClosureState,
    setJustification,
  }
}
