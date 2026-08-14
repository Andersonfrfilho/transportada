/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { NfseExportEmptyError, NfseExportLimitExceededError } from '../domain/nfse-export.error.js'

import {
  NFSE_EXPORT_DEFAULT_FORMAT,
  NFSE_EXPORT_MAX_DOCUMENTS,
  type ExportNfseDocumentsUseCase,
  type NfseArchiveEntry,
  type NfseArchivePort,
  type NfseExportDocument,
  type NfseExportFormat,
  type NfseExportRequest,
  type NfseExportResult,
  type NfseExportSelectionPort,
  type NfseExportSelectionQuery,
} from './export-nfse-documents.port.js'

export type ExportNfseDocumentsDependencies = {
  readonly archive: NfseArchivePort
  readonly clock: () => Date
  readonly selection: NfseExportSelectionPort
}

const FILE_NAME_PREFIX: Readonly<Record<NfseExportFormat, string>> = {
  both: 'nfse-documentos',
  pdf: 'nfse-pdf',
  xml: 'nfse-xml',
}

export function createExportNfseDocumentsUseCase(
  dependencies: ExportNfseDocumentsDependencies,
): ExportNfseDocumentsUseCase {
  return {
    async exportDocuments(input: NfseExportRequest): Promise<NfseExportResult> {
      const documents = await dependencies.selection.listAuthorizedDocuments(
        buildSelectionQuery(input),
      )
      if (documents.length > NFSE_EXPORT_MAX_DOCUMENTS) {
        throw new NfseExportLimitExceededError(NFSE_EXPORT_MAX_DOCUMENTS)
      }
      if (documents.length === 0) throw new NfseExportEmptyError()

      const format = input.format ?? NFSE_EXPORT_DEFAULT_FORMAT
      const entries = documents.flatMap((document) => buildEntries({ document, format }))
      // ZIP vazio seria pior que erro: o operador salvaria um arquivo que não explica nada.
      if (entries.length === 0) throw new NfseExportEmptyError()

      return {
        documentCount: documents.length,
        fileName: buildFileName({ exportedAt: dependencies.clock(), format }),
        stream: await dependencies.archive.createArchive(entries),
      }
    },
  }
}

/** A empresa vem sempre do contexto autenticado — o corpo da requisição nunca a escolhe. */
function buildSelectionQuery(input: NfseExportRequest): NfseExportSelectionQuery {
  return {
    companyId: input.context.companyId,
    invoiceIds: input.invoiceIds,
    limit: NFSE_EXPORT_MAX_DOCUMENTS + 1,
  }
}

/**
 * O XML é o documento fiscal e sem ele a nota não liquida; o PDF é conveniência da prefeitura e sua
 * falta só é registrada. A nota entra no ZIP com o que tem, em vez de derrubar o lote inteiro.
 */
function buildEntries(input: {
  readonly document: NfseExportDocument
  readonly format: NfseExportFormat
}): readonly NfseArchiveEntry[] {
  const xml =
    input.format === 'pdf' || input.document.xml === null
      ? []
      : [
          toEntry({
            extension: 'xml',
            identifier: input.document.identifier,
            object: input.document.xml,
          }),
        ]
  const pdf =
    input.format === 'xml' || input.document.pdf === null
      ? []
      : [
          toEntry({
            extension: 'pdf',
            identifier: input.document.identifier,
            object: input.document.pdf,
          }),
        ]

  return [...xml, ...pdf]
}

function toEntry(input: {
  readonly extension: 'pdf' | 'xml'
  readonly identifier: string
  readonly object: { readonly bucket: string; readonly objectKey: string }
}): NfseArchiveEntry {
  return {
    name: `nfse-${input.identifier}.${input.extension}`,
    source: { bucket: input.object.bucket, kind: 'object', objectKey: input.object.objectKey },
  }
}

function buildFileName(input: {
  readonly exportedAt: Date
  readonly format: NfseExportFormat
}): string {
  const stamp = input.exportedAt
    .toISOString()
    .replaceAll(/[-:]/gu, '')
    .replace('T', '-')
    .slice(0, 15)

  return `${FILE_NAME_PREFIX[input.format]}-${stamp}.zip`
}
