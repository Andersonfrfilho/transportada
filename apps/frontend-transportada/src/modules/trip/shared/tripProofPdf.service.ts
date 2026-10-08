/* Copyright (c) 2026 Ada Technology. MIT License. */
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import {
  resolveTripReportFilters,
  TRIP_REPORT_DOCUMENT_BATCH_SIZE,
  type TripReportScope,
} from './tripReport.service'
import { buildTripReportSearch } from './tripReportClient.service'
import { TRIP_ERROR } from './trip.constant'
import type { TripReportFilters } from './tripReport.types'

export const TRIP_PROOF_PDF_PATH = '/trip-document-report/proofs-pdf'
export const TRIP_PROOF_PDF_TOO_LARGE_CODE = 'TRIP_PROOF_REPORT_TOO_LARGE'
export const TRIP_PROOF_PDF_FILE_NAME = 'trip-proofs.pdf'
/** O PDF é uma resposta só: `documentIdIn` acima do teto da API não cabe em um pedido. */
export const TRIP_PROOF_PDF_MAX_DOCUMENT_IDS = TRIP_REPORT_DOCUMENT_BATCH_SIZE
const PDF_QUERY_LIMIT = 100

/** `maxBlocks` é o teto que a API recusou; `undefined` quando a mensagem não o traz. */
export class TripProofPdfTooLargeError extends Error {
  public readonly maxBlocks: number | undefined

  public constructor(maxBlocks?: number) {
    super(TRIP_PROOF_PDF_TOO_LARGE_CODE)
    this.maxBlocks = maxBlocks
  }
}

export class TripProofPdfTooManyDocumentsError extends Error {
  public constructor() {
    super('TRIP_PROOF_PDF_TOO_MANY_DOCUMENTS')
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

export function isTripProofPdfScopeTooBroad(scope: TripReportScope): boolean {
  const documentIds = resolveTripReportFilters(scope).documentIdIn
  return documentIds !== undefined && documentIds.length > TRIP_PROOF_PDF_MAX_DOCUMENT_IDS
}

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

export type ExportTripProofPdfInput = Readonly<{
  fetchPdf: TripProofPdfFetch
  savePdf?: TripProofPdfSave
  scope: TripReportScope
  signal?: AbortSignal
}>

export async function exportTripProofPdf(input: ExportTripProofPdfInput): Promise<void> {
  if (isTripProofPdfScopeTooBroad(input.scope)) throw new TripProofPdfTooManyDocumentsError()
  const blob = await input.fetchPdf({
    filters: resolveTripReportFilters(input.scope),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })
  input.signal?.throwIfAborted()
  ;(input.savePdf ?? saveArchiveFile)({ blob, fileName: TRIP_PROOF_PDF_FILE_NAME })
}
