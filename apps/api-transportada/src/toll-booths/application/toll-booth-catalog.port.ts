/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O contrato devolve o catálogo e o ajuste **crus, lado a lado** — nunca o valor efetivo. Compor
 * `catalog`/`adjustment` num só número é trabalho de `resolveEffectiveTollBoothCharge` (spec 086),
 * nunca deste repositório (plano 154 item 4).
 *
 * `catalog` nunca é nulo: `company_toll_booth_charges.osm_node_id` tem FK `restrict` para
 * `toll_booths.osm_node_id`, e a D7 proíbe apagar praça — não existe hoje ajuste sem praça no
 * catálogo (`catalogKnown: false` da spec 154 D1), e por isso o tipo não finge esse estado.
 */
import type {
  TollBoothCatalogEntry,
  TollBoothChargeAdjustmentRow,
} from '../../companies/domain/toll-booth-charge.policy.js'

export type TollBoothCatalogRow = Readonly<{
  adjustment: TollBoothChargeAdjustmentRow | null
  catalog: TollBoothCatalogEntry
  osmNodeId: number
  seen: boolean
}>

export type TollBoothCatalogPage = Readonly<{
  page: number
  perPage: number
  rows: readonly TollBoothCatalogRow[]
  total: number
}>

export type ListTollBoothCatalogParams = Readonly<{
  companyId: string
  page?: number
  perPage?: number
  /** Nome ou operador da praça — nunca alcança o ajuste, que não guarda nenhum dos dois. */
  search?: string
  seenOsmNodeIds: readonly number[]
}>

export type TollBoothCatalogPort = Readonly<{
  listCatalog(params: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage>
}>
