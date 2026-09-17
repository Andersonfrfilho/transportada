/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PackageBoxMeasurementSource,
  PackageBoxMeasurementWarning,
} from '../domain/package-box-measurement.constant.js'

export type PackageBoxView = {
  readonly cartonGtin: string | null
  readonly commercialUnit: string
  readonly description: string
  readonly emitterTaxId: string
  /** Spec 155 (D2, D9, G002): `undefined` quando a caixa não tem família — sem rótulo ou prefixo curto. */
  readonly familyKey: string | undefined
  readonly familyMeasuredCount: number
  readonly familyPendingCount: number
  readonly grossWeightGrams: number | null
  readonly heightMm: number | null
  readonly id: string
  readonly lengthMm: number | null
  readonly measuredAt: string | null
  /** Spec 152 (D8, experimental): `null` em toda caixa medida antes desta spec. */
  readonly measurementMarginMm: number | null
  readonly measurementSource: PackageBoxMeasurementSource | null
  /** Spec 155 (D3, D8, G002): quantas outras embalagens o mesmo `cProd` tem — nunca conta como família. */
  readonly packagingSiblingCount: number
  /** O sufixo numérico da unidade (`CX36` → 36); `undefined` quando a unidade não termina em número. */
  readonly packagingUnitCount: number | undefined
  readonly productCode: string
  readonly unitsPerBox: number
  /** Volumes já transportados desta caixa — é o que ordena a fila do conferente. */
  readonly transportedVolumes: number
  /** Spec 155 (D2): o que resta da descrição depois do prefixo — string vazia sem família. */
  readonly variantLabel: string
  readonly widthMm: number | null
}

export const PACKAGE_BOX_STATUS_FILTERS = ['pending', 'measured', 'all'] as const

export type PackageBoxStatusFilter = (typeof PACKAGE_BOX_STATUS_FILTERS)[number]

export type PackageBoxFilters = {
  /** Texto livre do conferente: casa descrição e código do produto. */
  readonly search?: string
  /**
   * O que o leitor bipou: o código lido **e** a redução a GTIN-13, quando ela existe. Lista vazia é
   * "li algo que não é código nenhum" — busca sem resultado, nunca busca sem filtro.
   */
  readonly scanCodes?: readonly string[]
  /**
   * A situação da medida. `pending` é o padrão — a fila existe para dizer o que medir agora —, e
   * `all` serve a quem foi conferir ou corrigir uma caixa que já mediu.
   */
  readonly status?: PackageBoxStatusFilter
}

/**
 * Spec 152 (D17, experimental): o que a câmera propôs antes de qualquer edição do operador — guardado
 * só no histórico (`nfe_package_box_measurements`), nunca na caixa. Margem ausente numa dimensão é
 * "câmera não propôs nada ali" (D6, acima de 30 mm o campo nem preenche).
 */
export type PackageBoxCameraMeasurement = {
  readonly engine: string
  readonly heightMarginMm?: number | undefined
  readonly impreciseConfirmed: boolean
  readonly lengthMarginMm?: number | undefined
  readonly proposedHeightMm?: number | undefined
  readonly proposedLengthMm?: number | undefined
  readonly proposedWidthMm?: number | undefined
  readonly warnings: readonly PackageBoxMeasurementWarning[]
  readonly widthMarginMm?: number | undefined
}

export type PackageBoxMeasurement = {
  /** Presente só com `source` diferente de `typed` (D8) — a câmera participou desta medida. */
  readonly camera?: PackageBoxCameraMeasurement | undefined
  readonly grossWeightGrams: number | null
  readonly heightMm: number
  /** Quantas unidades comerciais a caixa leva; `1` quando `uCom` já é a embalagem. */
  readonly unitsPerBox: number
  readonly lengthMm: number
  /** `typed` é o padrão retrocompatível (D8 revista: `manual` nunca existiu no contrato). */
  readonly source: PackageBoxMeasurementSource
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
   *
   * Spec 152 (D5, D17, experimental): grava a caixa **e** insere o histórico append-only na mesma
   * transação. Sem casar nenhuma caixa (outra empresa ou id inexistente), nada é gravado — nem a
   * caixa, nem o histórico.
   */
  measure(input: {
    readonly boxId: string
    readonly companyId: string
    readonly measurement: PackageBoxMeasurement
    /** D17: a maior margem, já resolvida pelo domínio — `null` para `source: typed`. */
    readonly measurementMarginMm: number | null
    readonly measuredByUserId: string
  }): Promise<boolean>
}
