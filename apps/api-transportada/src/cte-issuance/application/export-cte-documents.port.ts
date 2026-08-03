/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyCteItemFilters } from '../../cte-batches/application/cte-batch-item.port.js'

/** Teto por requisição: o ZIP é montado em stream, mas a seleção ainda vira uma consulta só. */
export const CTE_EXPORT_MAX_DOCUMENTS = 500

export const CTE_EXPORT_CONTENT_TYPE = 'application/zip'

export type CteExportFilters = CompanyCteItemFilters

/** A aplicação só precisa da empresa: permissão é decisão da camada de rota. */
export type CteExportRequest = {
  readonly context: {
    readonly companyId: string
  }
  readonly filters?: CteExportFilters
  readonly itemIds?: readonly string[]
}

export type CteExportDocument = {
  readonly accessKey: string
  readonly bucket: string
  readonly objectKey: string
}

export type CteExportSelectionQuery = {
  readonly companyId: string
  readonly filters?: CteExportFilters
  readonly itemIds?: readonly string[]
  readonly limit: number
}

export type CteExportSelectionPort = {
  listAuthorizedDocuments(query: CteExportSelectionQuery): Promise<readonly CteExportDocument[]>
}

export type CteArchiveEntry = {
  readonly bucket: string
  readonly name: string
  readonly objectKey: string
}

export type CteArchivePort = {
  createArchive(entries: readonly CteArchiveEntry[]): Promise<ReadableStream<Uint8Array>>
}

export type CteExportResult = {
  readonly documentCount: number
  readonly fileName: string
  readonly stream: ReadableStream<Uint8Array>
}

export type ExportCteDocumentsUseCase = {
  exportDocuments(input: CteExportRequest): Promise<CteExportResult>
}
