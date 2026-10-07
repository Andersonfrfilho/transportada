/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useChangeCargoCaseMutation } from '../mutations/useChangeCargoCase.mutation'
import { CARGO_CASE_ERROR } from '../shared/cargoOccurrenceCase.constant'
import type { CargoCaseAction, ChangeCargoCaseInput } from '../shared/cargoOccurrenceCase.types'

/** Os painéis que pedem confirmação ou motivo; "Iniciar análise" vai direto, sem painel. */
export type CargoCasePanelKind = Exclude<CargoCaseAction, 'review'>

export type CargoCaseItemController = Readonly<{
  closePanel: () => void
  errorCode: string | undefined
  isPending: boolean
  isSettlementDirty: boolean
  /** O acerto é pré-requisito de encerrar: a pessoa decidiu `goods_paid` agora, ou o servidor recusou o encerramento. */
  isSettlementRequired: boolean
  openPanel: (kind: CargoCasePanelKind) => void
  panel: CargoCasePanelKind | undefined
  run: (input: Omit<ChangeCargoCaseInput, 'occurrenceId'>) => Promise<boolean>
  setSettlementDirty: (isDirty: boolean) => void
}>

/**
 * A tratativa de UMA avaria: o painel aberto, o erro que ficou (com o código, para a tela escolher o texto) e o que
 * já se sabe do acerto. A leitura das avarias não traz a decisão, só o estado — por isso o acerto abre quando a
 * pessoa decide `goods_paid` aqui, ou quando o servidor recusa o encerramento por falta dele.
 */
export function useCargoCaseItem(
  input: Readonly<{ arrivalId: string; occurrenceId: string }>,
): CargoCaseItemController {
  const mutation = useChangeCargoCaseMutation(input.arrivalId)
  const [panel, setPanel] = useState<CargoCasePanelKind | undefined>(undefined)
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)
  const [isSettlementRequired, setSettlementRequired] = useState(false)
  const [isSettlementDirty, setSettlementDirty] = useState(false)

  async function run(change: Omit<ChangeCargoCaseInput, 'occurrenceId'>): Promise<boolean> {
    setErrorCode(undefined)
    try {
      await mutation.mutateAsync({ ...change, occurrenceId: input.occurrenceId })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'REQUEST_FAILED'
      setErrorCode(code)
      if (code === CARGO_CASE_ERROR.settlementWithoutItems) {
        setSettlementRequired(true)
        setPanel(undefined)
      }
      return false
    }
    if (change.action === 'decide' && change.kind === 'goods_paid') setSettlementRequired(true)
    setPanel(undefined)
    return true
  }

  return {
    closePanel: () => {
      setPanel(undefined)
      setErrorCode(undefined)
    },
    errorCode,
    isPending: mutation.isPending,
    isSettlementDirty,
    isSettlementRequired,
    openPanel: (kind) => {
      setErrorCode(undefined)
      setPanel(kind)
    },
    panel,
    run,
    setSettlementDirty,
  }
}
