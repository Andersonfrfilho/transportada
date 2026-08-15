/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ArchiveEntry } from '../../shared/archive-stream.service.js'

/** Teto por requisição: o ZIP é montado em stream, mas a seleção ainda vira uma consulta só. */
export const NFSE_EXPORT_MAX_DOCUMENTS = 500

export const NFSE_EXPORT_CONTENT_TYPE = 'application/zip'

export const NFSE_EXPORT_FORMATS = ['both', 'pdf', 'xml'] as const
export type NfseExportFormat = (typeof NFSE_EXPORT_FORMATS)[number]

/** Quem seleciona notas e baixa quer a nota e o comprovante dela: o padrão leva os dois. */
export const NFSE_EXPORT_DEFAULT_FORMAT: NfseExportFormat = 'both'

/** A aplicação só precisa da empresa: permissão é decisão da camada de rota. */
export type NfseExportRequest = {
  readonly context: {
    readonly companyId: string
  }
  readonly format?: NfseExportFormat
  readonly invoiceIds: readonly string[]
}

export type NfseExportObject = {
  readonly bucket: string
  readonly objectKey: string
}

/**
 * O PDF da prefeitura é arquivado junto do XML — diferente do DACTE, que nasce renderizado na hora.
 * Aqui as duas fontes são objeto guardado, e a ausência do PDF é estado real da nota.
 */
export type NfseExportDocument = {
  readonly identifier: string
  readonly pdf: NfseExportObject | null
  readonly xml: NfseExportObject | null
}

export type NfseExportSelectionQuery = {
  readonly companyId: string
  readonly invoiceIds: readonly string[]
  readonly limit: number
}

export type NfseExportSelectionPort = {
  listAuthorizedDocuments(query: NfseExportSelectionQuery): Promise<readonly NfseExportDocument[]>
}

export type NfseArchiveEntry = ArchiveEntry

export type NfseArchivePort = {
  createArchive(entries: readonly NfseArchiveEntry[]): Promise<ReadableStream<Uint8Array>>
}

export type NfseExportResult = {
  readonly documentCount: number
  readonly fileName: string
  readonly stream: ReadableStream<Uint8Array>
}

export type ExportNfseDocumentsUseCase = {
  exportDocuments(input: NfseExportRequest): Promise<NfseExportResult>
}
