/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { useCompanyCteItemSummaryQuery } from '../queries/cteBatchItems.query'
import { resolveCteItemTransmissionSummary } from '../shared/cteBatchProgress.service'
import {
  resolveCteBatchSubmissionProgress,
  submitCteBatches,
  type CteBatchSubmissionOutcome,
  type CteBatchSubmissionTarget,
} from '../shared/cteBatchSubmissionQueue.service'

export type CteBatchSubmissionController = ReturnType<typeof useCteBatchSubmission>

type UseCteBatchSubmissionInput = Readonly<{
  companyId?: string
  onFinish?: () => void
  submitBatch: (batchId: string) => Promise<unknown>
}>

export function useCteBatchSubmission(input: UseCteBatchSubmissionInput) {
  const [completed, setCompleted] = useState(0)
  const [total, setTotal] = useState(0)
  const [outcomes, setOutcomes] = useState<readonly CteBatchSubmissionOutcome[]>([])

  const submitMutation = useMutation({
    mutationFn: (batches: readonly CteBatchSubmissionTarget[]) =>
      submitCteBatches({
        batches,
        onProgress: (event) => {
          setCompleted(event.completed)
          setOutcomes((current) => [...current, event.outcome])
        },
        submitBatch: input.submitBatch,
      }),
    onSuccess: (results) => {
      setOutcomes(results)
      input.onFinish?.()
    },
  })

  function submit(batches: readonly CteBatchSubmissionTarget[]): void {
    if (batches.length === 0 || submitMutation.isPending) return
    setCompleted(0)
    setOutcomes([])
    setTotal(batches.length)
    submitMutation.mutate(batches)
  }

  /** Lote recusado no enfileiramento nunca chega à SEFAZ — só o aceito entra na conta da transmissão. */
  const submittedBatchIds = outcomes
    .filter((outcome) => outcome.errorCode === undefined)
    .map((outcome) => outcome.batchId)

  /**
   * Um lote com 167 CT-es andava de 0% a 100% de uma vez: o operador precisa ver a nota, não o lote.
   * O recorte dos lotes aceitos é relido enquanto houver item em voo e devolve a contagem por situação.
   */
  const itemSummaryQuery = useCompanyCteItemSummaryQuery({
    batchIdIn: submittedBatchIds,
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    enabled: input.companyId !== undefined && submittedBatchIds.length > 0,
  })

  return {
    isSubmitting: submitMutation.isPending,
    /** Sem lote aceito não há recorte: a barra por nota some em vez de mostrar 0 de 0. */
    itemTransmission:
      submittedBatchIds.length === 0
        ? undefined
        : resolveCteItemTransmissionSummary(itemSummaryQuery.data),
    outcomes,
    progress: resolveCteBatchSubmissionProgress({ completed, outcomes, total }),
    submit,
    submittedBatchIds,
    total,
  }
}
