/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type PackageBoxView = {
  readonly cartonGtin: string | null
  readonly commercialUnit: string
  readonly description: string
  readonly emitterTaxId: string
  readonly grossWeightGrams: number | null
  readonly heightMm: number | null
  readonly id: string
  readonly lengthMm: number | null
  readonly measuredAt: string | null
  readonly productCode: string
  readonly unitsPerBox: number
  /** Volumes já transportados desta caixa — é o que ordena a fila do conferente. */
  readonly transportedVolumes: number
  readonly widthMm: number | null
}

export type PackageBoxFilters = {
  /** Texto livre do conferente: casa descrição e código do produto. */
  readonly search?: string
  /**
   * O que o leitor bipou: o código lido **e** a redução a GTIN-13, quando ela existe. Lista vazia é
   * "li algo que não é código nenhum" — busca sem resultado, nunca busca sem filtro.
   */
  readonly scanCodes?: readonly string[]
  /** `true` traz só o que ainda não tem medida — o padrão da fila. */
  readonly pendingOnly?: boolean
}

export type PackageBoxMeasurement = {
  readonly grossWeightGrams: number | null
  readonly heightMm: number
  /** Quantas unidades comerciais a caixa leva; `1` quando `uCom` já é a embalagem. */
  readonly unitsPerBox: number
  readonly lengthMm: number
  readonly widthMm: number
}

export type PackageBoxRepositoryPort = {
  list(input: {
    readonly companyId: string
    readonly filters: PackageBoxFilters
    readonly limit: number
  }): Promise<readonly PackageBoxView[]>
  /**
   * ⚠️ Devolve só **se achou**, nunca a linha. A caixa gravada não tem os campos da fila (`share`,
   * `cumulativeShare`, `withinCoverage`), que nascem da política de ordenação — devolvê-la obrigava
   * o cliente a validar dois formatos com um guard só, e toda medição bem-sucedida virava erro na
   * tela com a medida já gravada no banco. Quem recarrega a fila é a releitura, que já existe.
   */
  measure(input: {
    readonly boxId: string
    readonly companyId: string
    readonly measurement: PackageBoxMeasurement
  }): Promise<boolean>
}
