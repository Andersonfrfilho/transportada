/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripReportFetchPage, TripReportFilters, TripReportResult } from './tripReport.types'

export const TRIP_REPORT_PATH = '/trip-document-report'
export const TRIP_REPORT_PAGE_LIMIT = 100
export const TRIP_REPORT_TOO_LARGE_CODE = 'TRIP_REPORT_TOO_LARGE'

/** `maxRows` é o teto que a API recusou; `undefined` quando a mensagem não o traz. */
export class TripReportTooLargeError extends Error {
  public readonly maxRows: number | undefined

  public constructor(maxRows?: number) {
    super(TRIP_REPORT_TOO_LARGE_CODE)
    this.maxRows = maxRows
  }
}

export type TripReportScope = Readonly<{
  documentIds?: readonly string[]
  filters?: TripReportFilters
  selectedTripIds?: readonly string[]
}>

/** Seleção ganha de filtro: marcou viagens, o relatório é só delas. Nota marcada (aba de notas) idem. */
export function resolveTripReportFilters(scope: TripReportScope): TripReportFilters {
  if (scope.selectedTripIds !== undefined && scope.selectedTripIds.length > 0) {
    return { tripIdIn: scope.selectedTripIds }
  }
  if (scope.documentIds !== undefined && scope.documentIds.length > 0) {
    return { documentIdIn: scope.documentIds }
  }
  return scope.filters ?? {}
}

export function readTripReportMaxRows(message: unknown): number | undefined {
  if (typeof message !== 'string') return undefined
  const matched = /more than (\d+) rows/.exec(message)
  return matched?.[1] === undefined ? undefined : Number(matched[1])
}

export type FetchTripReportInput = Readonly<{
  fetchPage: TripReportFetchPage
  filters: TripReportFilters
  onProgress?: (loaded: number, total: number | undefined) => void
  signal?: AbortSignal
}>

export async function fetchTripReport(input: FetchTripReportInput): Promise<TripReportResult> {
  const rows: TripReportResult['rows'][number][] = []
  let excludedWithoutTrip = 0
  let cursor: null | string = null
  do {
    input.signal?.throwIfAborted()
    // O cursor da próxima página só existe na resposta da anterior: a busca é sequencial por natureza.
    const page = await input.fetchPage({
      cursor,
      filters: input.filters,
      limit: TRIP_REPORT_PAGE_LIMIT,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    rows.push(...page.rows)
    excludedWithoutTrip = page.excludedWithoutTrip ?? excludedWithoutTrip
    cursor = page.nextCursor
    input.onProgress?.(rows.length, page.total)
  } while (cursor !== null)
  return { excludedWithoutTrip, rows }
}
