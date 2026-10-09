/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DestinationRow } from '../domain/holiday-city-discovery.policy.js'

export type { DestinationRow } from '../domain/holiday-city-discovery.policy.js'

/**
 * A posição da descoberta sobre `nfe_documents_company_updated_issued_id_idx`. Os instantes viajam como
 * **texto do Postgres**, com os microssegundos: um `Date` do JavaScript os cortaria em milissegundos, e
 * a última nota de um lote seria lida de novo (e recontada) no lote seguinte.
 */
export type DiscoveryCursor = {
  readonly documentId: string
  readonly issuedAt: string
  readonly updatedAt: string
}

export type DiscoveryCompany = {
  readonly companyId: string
  readonly cursor: DiscoveryCursor | undefined
}

export type SaveDiscoveryBatchParams = {
  readonly cityCounts: ReadonlyMap<string, number>
  readonly companyId: string
  readonly cursor: DiscoveryCursor
  readonly seenAt: Date
}

export type HolidayDiscoveryStore = {
  /** Empresas ativas e com a importação ligada (sem linha de configuração vale ligada). */
  listCompanies(): Promise<readonly DiscoveryCompany[]>
  /** Os endereços de entrega e do destinatário das notas do lote, numa consulta só. */
  readDestinations(params: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<readonly DestinationRow[]>
  /** Em ordem crescente do cursor, depois dele. */
  readDocumentBatch(params: {
    readonly companyId: string
    readonly cursor: DiscoveryCursor | undefined
    readonly limit: number
  }): Promise<readonly DiscoveryCursor[]>
  /** Soma as cidades do lote e move o cursor na mesma transação. */
  saveBatch(params: SaveDiscoveryBatchParams): Promise<void>
}
