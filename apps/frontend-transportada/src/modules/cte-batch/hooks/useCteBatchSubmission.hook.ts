/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import {
  resolveCteBatchSubmissionProgress,
  submitCteBatches,
  type CteBatchSubmissionOutcome,
  type CteBatchSubmissionTarget,
} from '../shared/cteBatchSubmissionQueue.service'

export type CteBatchSubmissionController = ReturnType<typeof useCteBatchSubmission>

type UseCteBatchSubmissionInput = Readonly<{
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

  return {
    isSubmitting: submitMutation.isPending,
    outcomes,
    progress: resolveCteBatchSubmissionProgress({ completed, outcomes, total }),
    submit,
    total,
  }
}
