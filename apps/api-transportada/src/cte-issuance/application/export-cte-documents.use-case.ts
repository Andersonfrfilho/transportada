/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CteExportEmptyError, CteExportLimitExceededError } from '../domain/cte-export.error.js'

import {
  CTE_EXPORT_MAX_DOCUMENTS,
  type CteArchiveEntry,
  type CteArchivePort,
  type CteExportDocument,
  type CteExportRequest,
  type CteExportResult,
  type CteExportSelectionPort,
  type CteExportSelectionQuery,
  type ExportCteDocumentsUseCase,
} from './export-cte-documents.port.js'

export type ExportCteDocumentsDependencies = {
  readonly archive: CteArchivePort
  readonly clock: () => Date
  readonly selection: CteExportSelectionPort
}

export function createExportCteDocumentsUseCase(
  dependencies: ExportCteDocumentsDependencies,
): ExportCteDocumentsUseCase {
  return {
    async exportDocuments(input: CteExportRequest): Promise<CteExportResult> {
      const documents = await dependencies.selection.listAuthorizedDocuments(
        buildSelectionQuery(input),
      )
      if (documents.length > CTE_EXPORT_MAX_DOCUMENTS) {
        throw new CteExportLimitExceededError(CTE_EXPORT_MAX_DOCUMENTS)
      }
      if (documents.length === 0) throw new CteExportEmptyError()

      return {
        documentCount: documents.length,
        fileName: buildFileName(dependencies.clock()),
        stream: await dependencies.archive.createArchive(documents.map(toArchiveEntry)),
      }
    },
  }
}

/** A empresa vem sempre do contexto autenticado — o corpo da requisição nunca a escolhe. */
function buildSelectionQuery(input: CteExportRequest): CteExportSelectionQuery {
  return {
    companyId: input.context.companyId,
    ...(input.filters === undefined ? {} : { filters: input.filters }),
    ...(input.itemIds === undefined ? {} : { itemIds: input.itemIds }),
    limit: CTE_EXPORT_MAX_DOCUMENTS + 1,
  }
}

function toArchiveEntry(document: CteExportDocument): CteArchiveEntry {
  return {
    bucket: document.bucket,
    name: `${document.accessKey}.xml`,
    objectKey: document.objectKey,
  }
}

function buildFileName(exportedAt: Date): string {
  const stamp = exportedAt.toISOString().replaceAll(/[-:]/gu, '').replace('T', '-').slice(0, 15)

  return `cte-xml-${stamp}.zip`
}
