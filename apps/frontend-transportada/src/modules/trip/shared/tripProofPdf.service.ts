/* Copyright (c) 2026 Ada Technology. MIT License. */
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import {
  resolveTripReportFilters,
  TRIP_REPORT_DOCUMENT_BATCH_SIZE,
  type TripReportScope,
} from './tripReport.service'
import { buildTripExportFileName } from './tripExportFileName.service'
import { buildTripReportSearch } from './tripReportClient.service'
import { TRIP_ERROR } from './trip.constant'
import type { TripReportFilters } from './tripReport.types'

export const TRIP_PROOF_PDF_PATH = '/trip-document-report/proofs-pdf'
export const TRIP_PROOF_PDF_TOO_LARGE_CODE = 'TRIP_PROOF_REPORT_TOO_LARGE'
export const TRIP_PROOF_PDF_BASE_NAME = 'trip-proofs'
/** `documentIdIn` acima do teto da API não cabe num pedido: a seleção maior sai em vários PDFs. */
export const TRIP_PROOF_PDF_MAX_DOCUMENT_IDS = TRIP_REPORT_DOCUMENT_BATCH_SIZE
/** Teto de canhotos por PDF quando a API recusa sem dizer o número. */
export const TRIP_PROOF_PDF_DEFAULT_MAX_BLOCKS = 200
const PDF_QUERY_LIMIT = 100

/** `maxBlocks` é o teto que a API recusou; `undefined` quando a mensagem não o traz. */
export class TripProofPdfTooLargeError extends Error {
  public readonly maxBlocks: number | undefined

  public constructor(maxBlocks?: number) {
    super(TRIP_PROOF_PDF_TOO_LARGE_CODE)
    this.maxBlocks = maxBlocks
  }
}

export type TripProofPdfFetch = (
  input: Readonly<{ filters: TripReportFilters; signal?: AbortSignal }>,
) => Promise<Blob>

export type TripProofPdfSave = (file: Readonly<{ blob: Blob; fileName: string }>) => void

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export function buildTripProofPdfSearch(filters: TripReportFilters): string {
  return buildTripReportSearch({ cursor: null, filters, limit: PDF_QUERY_LIMIT })
}

export function readTripProofPdfMaxBlocks(message: unknown): number | undefined {
  if (typeof message !== 'string') return undefined
  const matched = /more than (\d+) documents/.exec(message)
  return matched?.[1] === undefined ? undefined : Number(matched[1])
}

async function readErrorPayload(
  response: Response,
): Promise<{ code?: unknown; message?: unknown }> {
  try {
    const payload = (await response.json()) as { error?: { code?: unknown; message?: unknown } }
    return payload.error ?? {}
  } catch {
    return {}
  }
}

export function createTripProofPdfFetch(dependencies: ClientDependencies): TripProofPdfFetch {
  return async ({ filters, signal }) => {
    const accessToken = await dependencies.getAccessToken()
    const response = await dependencies.fetch(
      new Request(
        `${dependencies.apiUrl}${TRIP_PROOF_PDF_PATH}?${buildTripProofPdfSearch(filters)}`,
        {
          cache: 'no-store',
          headers: { authorization: `Bearer ${accessToken}` },
          method: 'GET',
          ...(signal === undefined ? {} : { signal }),
        },
      ),
    )
    if (response.ok) return response.blob()
    const error = await readErrorPayload(response)
    if (error.code === TRIP_PROOF_PDF_TOO_LARGE_CODE) {
      throw new TripProofPdfTooLargeError(readTripProofPdfMaxBlocks(error.message))
    }
    throw new Error(typeof error.code === 'string' ? error.code : TRIP_ERROR.REQUEST_FAILED)
  }
}

export type TripProofPdfProgress = Readonly<{
  /** Partes já salvas; `total` fica `undefined` até saber em quantas o PDF se divide. */
  completed: number
  phase: 'generating' | 'planning'
  total: number | undefined
}>

type TripProofPdfRow = Readonly<{ tripId: string }>

export type TripProofPdfFetchRows = (
  input: Readonly<{ scope: TripReportScope; signal?: AbortSignal }>,
) => Promise<readonly TripProofPdfRow[]>

export type ExportTripProofPdfInput = Readonly<{
  fetchPdf: TripProofPdfFetch
  fetchRows: TripProofPdfFetchRows
  onProgress?: (progress: TripProofPdfProgress) => void
  savePdf?: TripProofPdfSave
  scope: TripReportScope
  signal?: AbortSignal
}>

export function splitTripProofPdfDocumentIds(
  documentIds: readonly string[],
): readonly (readonly string[])[] {
  const chunks: (readonly string[])[] = []
  for (let start = 0; start < documentIds.length; start += TRIP_PROOF_PDF_MAX_DOCUMENT_IDS) {
    chunks.push(documentIds.slice(start, start + TRIP_PROOF_PDF_MAX_DOCUMENT_IDS))
  }
  return chunks
}

/** Viagem inteira em cada parte: o canhoto de uma nota não se separa das outras da viagem. */
export function packTripProofPdfTrips(input: {
  capacity: number
  rows: readonly TripProofPdfRow[]
}): readonly (readonly string[])[] {
  const notesByTrip = new Map<string, number>()
  for (const row of input.rows) notesByTrip.set(row.tripId, (notesByTrip.get(row.tripId) ?? 0) + 1)
  const parts: string[][] = []
  let currentNotes = 0
  for (const [tripId, notes] of notesByTrip) {
    if (notes > input.capacity) throw new TripProofPdfTooLargeError(input.capacity)
    const currentPart = parts.at(-1)
    if (currentPart === undefined || currentNotes + notes > input.capacity) {
      parts.push([tripId])
      currentNotes = notes
    } else {
      currentPart.push(tripId)
      currentNotes += notes
    }
  }
  return parts
}

function buildPartFileName(part: number, total: number): string {
  return buildTripExportFileName({
    baseName:
      total === 1
        ? TRIP_PROOF_PDF_BASE_NAME
        : `${TRIP_PROOF_PDF_BASE_NAME}-part-${part}-of-${total}`,
    extension: 'pdf',
  })
}

async function exportParts(
  input: ExportTripProofPdfInput,
  partsFilters: readonly TripReportFilters[],
): Promise<void> {
  const save = input.savePdf ?? saveArchiveFile
  for (const [index, filters] of partsFilters.entries()) {
    input.onProgress?.({ completed: index, phase: 'generating', total: partsFilters.length })
    const blob = await input.fetchPdf({
      filters,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    input.signal?.throwIfAborted()
    save({ blob, fileName: buildPartFileName(index + 1, partsFilters.length) })
  }
  input.onProgress?.({
    completed: partsFilters.length,
    phase: 'generating',
    total: partsFilters.length,
  })
}

async function exportSplitByTrips(
  input: ExportTripProofPdfInput,
  tooLarge: TripProofPdfTooLargeError,
): Promise<void> {
  input.onProgress?.({ completed: 0, phase: 'planning', total: undefined })
  const rows = await input.fetchRows({
    scope: input.scope,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })
  input.signal?.throwIfAborted()
  const groups = packTripProofPdfTrips({
    capacity: tooLarge.maxBlocks ?? TRIP_PROOF_PDF_DEFAULT_MAX_BLOCKS,
    rows,
  })
  if (groups.length <= 1) throw tooLarge
  const filters = resolveTripReportFilters(input.scope)
  await exportParts(
    input,
    groups.map((tripIdIn) => ({ ...filters, tripIdIn })),
  )
}

/** Um PDF quando cabe; acima do teto da API, vários — por grupos de notas ou, sem seleção, por grupos de viagens. */
export async function exportTripProofPdf(input: ExportTripProofPdfInput): Promise<void> {
  const filters = resolveTripReportFilters(input.scope)
  const documentIds = filters.documentIdIn
  if (documentIds !== undefined && documentIds.length > TRIP_PROOF_PDF_MAX_DOCUMENT_IDS) {
    await exportParts(
      input,
      splitTripProofPdfDocumentIds(documentIds).map((documentIdIn) => ({
        ...filters,
        documentIdIn,
      })),
    )
    return
  }
  try {
    await exportParts(input, [filters])
  } catch (error) {
    if (!(error instanceof TripProofPdfTooLargeError) || documentIds !== undefined) throw error
    await exportSplitByTrips(input, error)
  }
}
