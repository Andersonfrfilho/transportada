/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  listTouchedDocuments,
  useSeparationTouchMutation,
  type TouchFailure,
  type TouchRequest,
} from '../mutations/useSeparationTouch.mutation'
import type {
  CargoArrivalDocument,
  CargoArrivalGroup,
  CargoDocumentOutcome,
} from '../shared/cargoArrival.types'

export type SeparationTouchesController = Readonly<{
  dismissOutcomes: () => void
  failures: ReadonlyMap<string, TouchFailure>
  outcomes: readonly CargoDocumentOutcome[] | undefined
  pendingIds: ReadonlySet<string>
  refusals: ReadonlyMap<string, string>
  retry: (failure: TouchFailure) => void
  separateGroup: (group: CargoArrivalGroup) => void
  touchDocument: (document: CargoArrivalDocument) => void
}>

function withoutKeys<TValue>(
  source: ReadonlyMap<string, TValue>,
  keys: readonly string[],
): Map<string, TValue> {
  return new Map([...source].filter(([key]) => !keys.includes(key)))
}

/**
 * O que é do toque: o que está em voo, o que falhou (e fica na tela com "tentar de novo") e o que o
 * servidor recusou. O estado de servidor em si — a chegada — é do TanStack Query.
 */
export function useSeparationTouches(arrivalId: string): SeparationTouchesController {
  const [failures, setFailures] = useState<ReadonlyMap<string, TouchFailure>>(new Map())
  const [refusals, setRefusals] = useState<ReadonlyMap<string, string>>(new Map())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [outcomes, setOutcomes] = useState<readonly CargoDocumentOutcome[] | undefined>(undefined)

  const mutation = useSeparationTouchMutation({
    arrivalId,
    onFailure: (failure) =>
      setFailures((current) => {
        const next = new Map(current)
        for (const documentId of failure.documentIds) next.set(documentId, failure)
        return next
      }),
    onResult: (run, request) => {
      setRefusals((current) => {
        const next = withoutKeys(
          current,
          run.results.map((result) => result.documentId),
        )
        for (const result of run.results) {
          if (result.outcome === 'refused') next.set(result.documentId, result.reason)
        }
        return next
      })
      if (request.kind === 'group') setOutcomes(run.results)
    },
  })

  async function execute(request: TouchRequest): Promise<void> {
    const ids = listTouchedDocuments(request).map((document) => document.nfeDocumentId)
    setFailures((current) => withoutKeys(current, ids))
    setPendingIds((current) => new Set([...current, ...ids]))
    try {
      await mutation.mutateAsync(request)
    } catch {
      // A falha já foi guardada em `onFailure`: é ela que a nota mostra, com o "tentar de novo".
    } finally {
      setPendingIds((current) => new Set([...current].filter((id) => !ids.includes(id))))
    }
  }

  return {
    dismissOutcomes: () => setOutcomes(undefined),
    failures,
    outcomes,
    pendingIds,
    refusals,
    retry: (failure) => void execute(failure.request),
    separateGroup: (group) => void execute({ documents: group.documents, kind: 'group' }),
    touchDocument: (document) => void execute({ document, kind: 'single' }),
  }
}
