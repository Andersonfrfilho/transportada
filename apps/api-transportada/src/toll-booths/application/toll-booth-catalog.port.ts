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

/** Colunas mínimas do catálogo inteiro, para o agregado da T202b — nunca a praça inteira. */
export type TollBoothCatalogAxleChargeRow = Readonly<{
  chargePerAxle: null | string
  osmNodeId: number
}>

export type TollBoothCatalogPage = Readonly<{
  page: number
  perPage: number
  rows: readonly TollBoothCatalogRow[]
  total: number
}>

/**
 * `'only'`/`'exclude'` filtram por `seenOsmNodeIds` (T202: a praça vista entra ordenada à parte da
 * D1 antes do resto do catálogo). `'all'` (padrão) preserva o comportamento da T201, sem filtro —
 * é o que a T203 troca por `'only'` para a lista antiga de `company-settings`.
 */
export type TollBoothCatalogSeenFilter = 'all' | 'exclude' | 'only'

export type ListTollBoothCatalogParams = Readonly<{
  companyId: string
  /**
   * Deslocamento explícito, em linhas — só para uso interno entre camadas (T202 pagina a
   * concatenação [vistas] ++ [resto] por deslocamento arbitrário, não por página). Presente, ele
   * substitui o cálculo por `page`/`perPage` e permite `perPage: 0` (a página cabe inteira nas
   * vistas, e o resto só precisa do `total`). Ausente, o comportamento é o de sempre.
   */
  offset?: number
  page?: number
  perPage?: number
  /** Nome ou operador da praça — nunca alcança o ajuste, que não guarda nenhum dos dois. */
  search?: string
  seenFilter?: TollBoothCatalogSeenFilter
  seenOsmNodeIds: readonly number[]
}>

export type TollBoothCatalogPort = Readonly<{
  listCatalog(params: ListTollBoothCatalogParams): Promise<TollBoothCatalogPage>
  /**
   * Colunas mínimas (`osmNodeId` + `chargePerAxle`) do catálogo **inteiro** — sem paginar, porque o
   * agregado da T202b (RF2, decisão de 2026-09-17: a contagem é pendência da empresa) precisa de
   * toda praça para resolver em memória contra o ajuste da empresa do contexto
   * (`toll-booth-axle-charge-gap.policy.ts`). Isto não é a listagem sem paginação que a RNF2 proíbe
   * — é leitura de duas colunas para um agregado, do mesmo jeito que `readCatalogSummary` já lê
   * `count`/`max` numa consulta só.
   */
  readCatalogAxleCharges(): Promise<readonly TollBoothCatalogAxleChargeRow[]>
}>
