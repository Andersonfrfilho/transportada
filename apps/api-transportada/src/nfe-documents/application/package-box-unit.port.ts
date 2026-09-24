/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163 — a medida da unidade da caixa e a caixa estimada por ela.
 */

/** `typed` (conferente), `catalog` (importação da 162) ou `manual:<domínio>` (userscript). */
export type PackageBoxUnitSource = 'catalog' | 'typed' | `manual:${string}`

export type PackageBoxUnit = {
  readonly grossWeightGrams?: number | undefined
  readonly heightMm: number
  readonly lengthMm: number
  readonly widthMm: number
}

export type PackageBoxStoredEstimate = {
  readonly arrangement: string
  readonly estimatedAt: Date
  readonly grossWeightGrams?: number | undefined
  readonly heightMm: number
  readonly lengthMm: number
  readonly volumeCm3: number
  readonly widthMm: number
}

/**
 * ⚠️ RNF02: não há campo de medida real aqui de propósito — este caminho nunca escreve em
 * `length_mm/width_mm/height_mm` nem em `measurement_source`.
 */
export type SavePackageBoxUnitInput = {
  readonly boxId: string
  readonly companyId: string
  /** `null` apaga a estimativa (unidade que não estima nada); só vale para caixa sem medida real. */
  readonly estimate: PackageBoxStoredEstimate | null
  readonly unit: PackageBoxUnit
  readonly unitSource: PackageBoxUnitSource
  readonly unitsPerBox?: number | undefined
}

export type PackageBoxUnitTarget = {
  readonly unitsPerBox: number
}

export type PackageBoxUnitRepositoryPort = {
  /** `null` quando a caixa não existe nesta empresa. */
  findUnitTarget(input: {
    readonly boxId: string
    readonly companyId: string
  }): Promise<PackageBoxUnitTarget | null>
  /**
   * Grava a unidade (e `units_per_box`, se veio). A estimativa só é escrita enquanto a caixa não
   * tem medida real — decidido na própria gravação, para uma medida concorrente nunca perder.
   * Devolve `false` quando nenhuma linha casou (outra empresa).
   */
  saveUnit(input: SavePackageBoxUnitInput): Promise<boolean>
}
