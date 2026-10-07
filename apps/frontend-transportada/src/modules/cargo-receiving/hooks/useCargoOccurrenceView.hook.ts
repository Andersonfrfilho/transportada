/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { useCargoOccurrencesQuery } from '../queries/useCargoOccurrences.query'
import type { CargoArrivalStatus } from '../shared/cargoArrival.types'
import type { CargoDocumentReturn, CargoOccurrenceView } from '../shared/cargoOccurrence.types'

const NO_OCCURRENCES: readonly CargoOccurrenceView[] = []
const NO_RETURN_COUNTS = { marked: 0, returned: 0 } as const

export type CargoOccurrenceViewController = Readonly<{
  hasFailed: boolean
  occurrences: readonly CargoOccurrenceView[]
  occurrencesOf: (documentId: string) => readonly CargoOccurrenceView[]
  returnCounts: Readonly<{ marked: number; returned: number }>
  returns: ReadonlyMap<string, CargoDocumentReturn>
}>

/** A marcação por nota e as avarias da chegada, indexadas por nota: a leitura vem só da rota de ocorrências. */
export function useCargoOccurrenceView(
  input: Readonly<{ arrivalId: string; status: CargoArrivalStatus | undefined }>,
): CargoOccurrenceViewController {
  const query = useCargoOccurrencesQuery(input)
  const view = query.data
  return useMemo(() => {
    const occurrences = view?.occurrences ?? NO_OCCURRENCES
    return {
      hasFailed: query.isError && view === undefined,
      occurrences,
      occurrencesOf: (documentId) =>
        occurrences.filter((item) => item.nfeDocumentId === documentId),
      returnCounts: view?.returnCounts ?? NO_RETURN_COUNTS,
      returns: new Map((view?.documents ?? []).map((entry) => [entry.nfeDocumentId, entry])),
    }
  }, [query.isError, view])
}
