/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162 — porta do importador de catálogo. Um grupo é todas as candidatas aceitas (já filtradas
 * pela sanidade da spec 160) para um mesmo `cartonGtin`; o repositório decide, por caixa casada
 * (RF06, P5: cada caixa na sua própria empresa), se é proposta, promoção, pulo por já medida, ou
 * repetição idempotente (RF07). Tudo dentro de uma única transação por execução (RNF01) — o
 * repositório é quem abre e fecha essa transação, porque só ele sabe o dialeto de `ROLLBACK`.
 */

export type PackageBoxCatalogImportCandidate = {
  readonly engine: string
  readonly grossWeightGrams: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly unitsPerBox: number
  readonly widthMm: number
}

export type PackageBoxCatalogImportGroup = {
  readonly candidates: readonly PackageBoxCatalogImportCandidate[]
  readonly cartonGtin: string
  /** RF05: só true quando `evaluatePackageBoxCatalogConsensus` (spec 160) achou duas fontes concordando. */
  readonly promoted: boolean
}

/**
 * Spec 163 (RF05): a medida da unidade de um `cartonGtin`, já aprovada pela sanidade da unidade.
 * `source` é `catalog` ou `manual:<domínio>` — nunca `typed`, que é decisão humana.
 */
export type PackageBoxCatalogImportUnit = {
  readonly cartonGtin: string
  readonly grossWeightGrams?: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly source: string
  readonly widthMm: number
}

export const PACKAGE_BOX_CATALOG_IMPORT_OUTCOMES = [
  'proposed',
  'promoted',
  'skipped_measured',
  'duplicate',
  'no_matching_box',
  /** Spec 163: unidade gravada (e estimativa recalculada, se a caixa não tem medida real). */
  'unit_recorded',
  /** Spec 163: a caixa já tem unidade digitada pelo conferente — catálogo nunca a sobrescreve. */
  'unit_skipped_typed',
] as const
export type PackageBoxCatalogImportOutcome = (typeof PACKAGE_BOX_CATALOG_IMPORT_OUTCOMES)[number]

export type PackageBoxCatalogImportWriteResult = {
  readonly boxId?: string
  readonly cartonGtin: string
  readonly companyId?: string
  readonly outcome: PackageBoxCatalogImportOutcome
}

export interface PackageBoxCatalogImportRepositoryPort {
  /**
   * RNF01: roda todos os grupos dentro de uma transação só. `apply: false` (simulação, P4) faz
   * `ROLLBACK` no fim — nada fica gravado, mesmo que cada escrita individual tenha "funcionado"
   * dentro da transação.
   */
  importCandidates(input: {
    readonly apply: boolean
    readonly groups: readonly PackageBoxCatalogImportGroup[]
    readonly units: readonly PackageBoxCatalogImportUnit[]
  }): Promise<readonly PackageBoxCatalogImportWriteResult[]>
}
