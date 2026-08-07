/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyCteItemFilters } from '../../cte-batches/application/cte-batch-item.port.js'
import type { DacteLogo, DacteXmlLocation } from './render-dacte.port.js'

/** Teto por requisição: o ZIP é montado em stream, mas a seleção ainda vira uma consulta só. */
export const CTE_EXPORT_MAX_DOCUMENTS = 500

export const CTE_EXPORT_CONTENT_TYPE = 'application/zip'

export type CteExportFilters = CompanyCteItemFilters

export const CTE_EXPORT_FORMATS = ['xml', 'pdf', 'both'] as const
export type CteExportFormat = (typeof CTE_EXPORT_FORMATS)[number]

/** XML é o padrão histórico da rota: quem não declara formato continua recebendo o que recebia. */
export const CTE_EXPORT_DEFAULT_FORMAT: CteExportFormat = 'xml'

/** A aplicação só precisa da empresa: permissão é decisão da camada de rota. */
export type CteExportRequest = {
  readonly context: {
    readonly companyId: string
  }
  readonly filters?: CteExportFilters
  readonly format?: CteExportFormat
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

/**
 * `lazy` existe para o DACTE: renderizar a seleção inteira antes de abrir o ZIP materializaria
 * centenas de PDFs em memória. O arquivo pede um documento por vez, na hora de gravá-lo.
 */
export type CteArchiveSource =
  | { readonly bucket: string; readonly kind: 'object'; readonly objectKey: string }
  | { readonly kind: 'lazy'; readonly load: () => Promise<Uint8Array> }

export type CteArchiveEntry = {
  readonly name: string
  readonly source: CteArchiveSource
}

/** A marca é a mesma para toda a seleção: buscá-la uma vez evita uma consulta por documento do ZIP. */
export type CteDacteRenderRequest = DacteXmlLocation & {
  readonly logo: DacteLogo | null
}

export type CteDacteRendererPort = {
  renderDacte(request: CteDacteRenderRequest): Promise<Uint8Array>
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
