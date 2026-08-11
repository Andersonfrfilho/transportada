/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  COMPANY_CTE_ITEM_SUMMARY_QUERY_KEY,
  COMPANY_CTE_ITEMS_QUERY_KEY,
  useCompanyCteItemSummaryQuery,
} from '../queries/cteBatchItems.query'
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
  const queryClient = useQueryClient()
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
    onSuccess: async (results) => {
      setOutcomes(results)
      input.onFinish?.()
      /**
       * A aba Lotes já somou este recorte ao selecionar o lote, e a chave do resumo é a mesma:
       * sem invalidar, a barra da SEFAZ lê o retrato de antes da transmissão — e como nele nada
       * consta em voo, o polling nem liga e a barra congela no que era verdade antes.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [COMPANY_CTE_ITEM_SUMMARY_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [COMPANY_CTE_ITEMS_QUERY_KEY] }),
      ])
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
