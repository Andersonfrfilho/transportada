/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CteExportEmptyError, CteExportLimitExceededError } from '../domain/cte-export.error.js'

import {
  CTE_EXPORT_DEFAULT_FORMAT,
  CTE_EXPORT_MAX_DOCUMENTS,
  type CteArchiveEntry,
  type CteArchivePort,
  type CteDacteRendererPort,
  type CteExportDocument,
  type CteExportFormat,
  type CteExportRequest,
  type CteExportResult,
  type CteExportSelectionPort,
  type CteExportSelectionQuery,
  type ExportCteDocumentsUseCase,
} from './export-cte-documents.port.js'
import type { DacteLogo, DacteLogoPort } from './render-dacte.port.js'

export type ExportCteDocumentsDependencies = {
  readonly archive: CteArchivePort
  readonly clock: () => Date
  readonly dacte: CteDacteRendererPort
  readonly logos: DacteLogoPort
  readonly selection: CteExportSelectionPort
}

const FILE_NAME_PREFIX: Readonly<Record<CteExportFormat, string>> = {
  both: 'cte-documentos',
  pdf: 'cte-dacte',
  xml: 'cte-xml',
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

      const format = input.format ?? CTE_EXPORT_DEFAULT_FORMAT
      // Exportação só de XML não desenha papel nenhum: nem vale a consulta da marca.
      const logo =
        format === 'xml'
          ? null
          : await dependencies.logos.findLogo({ companyId: input.context.companyId })
      const entries = documents.flatMap((document) =>
        buildEntries({ dacte: dependencies.dacte, document, format, logo }),
      )

      return {
        documentCount: documents.length,
        fileName: buildFileName({ exportedAt: dependencies.clock(), format }),
        stream: await dependencies.archive.createArchive(entries),
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

function buildEntries(input: {
  readonly dacte: CteDacteRendererPort
  readonly document: CteExportDocument
  readonly format: CteExportFormat
  readonly logo: DacteLogo | null
}): readonly CteArchiveEntry[] {
  const xml = input.format === 'pdf' ? [] : [toXmlEntry(input.document)]
  const pdf = input.format === 'xml' ? [] : [toDacteEntry({ ...input })]

  return [...xml, ...pdf]
}

function toXmlEntry(document: CteExportDocument): CteArchiveEntry {
  return {
    name: `${document.accessKey}.xml`,
    source: { bucket: document.bucket, kind: 'object', objectKey: document.objectKey },
  }
}

/** O DACTE nasce do XML autorizado guardado no storage, nunca do payload enviado à SEFAZ. */
function toDacteEntry(input: {
  readonly dacte: CteDacteRendererPort
  readonly document: CteExportDocument
  readonly logo: DacteLogo | null
}): CteArchiveEntry {
  return {
    name: `${input.document.accessKey}.pdf`,
    source: {
      kind: 'lazy',
      load: () =>
        input.dacte.renderDacte({
          bucket: input.document.bucket,
          logo: input.logo,
          objectKey: input.document.objectKey,
        }),
    },
  }
}

function buildFileName(input: {
  readonly exportedAt: Date
  readonly format: CteExportFormat
}): string {
  const stamp = input.exportedAt
    .toISOString()
    .replaceAll(/[-:]/gu, '')
    .replace('T', '-')
    .slice(0, 15)

  return `${FILE_NAME_PREFIX[input.format]}-${stamp}.zip`
}
