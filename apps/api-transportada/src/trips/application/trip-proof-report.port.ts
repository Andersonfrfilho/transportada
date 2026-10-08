/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripProofBlock, TripProofLetterhead } from '../domain/trip-proof-report.types.js'

/** O objeto da foto do canhoto; `bucket` e `objectKey` nunca saem do servidor. */
export type TripProofRecord = {
  readonly bucket: string
  readonly mimeType: string
  readonly objectKey: string
  readonly tripDocumentId: string
}

export type TripProofReportPort = {
  findExporterName(params: { readonly userId: string }): Promise<string | undefined>
  findLetterhead(params: { readonly companyId: string }): Promise<TripProofLetterhead>
  /** Uma consulta para todas as notas, em `created_at` crescente (evita N+1). */
  listPhotoProofs(params: {
    readonly companyId: string
    readonly tripDocumentIds: readonly string[]
  }): Promise<readonly TripProofRecord[]>
}

export type TripProofPdfRenderer = {
  readonly render: (input: {
    readonly blocks: readonly TripProofBlock[]
    readonly exportedBy: string
    readonly generatedAt: Date
    readonly letterhead: TripProofLetterhead
  }) => Promise<ReadableStream<Uint8Array>>
}
