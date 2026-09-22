/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PackageBoxMeasurementSource,
  PackageBoxMeasurementWarning,
} from '../domain/package-box-measurement.constant.js'

/**
 * Spec 152 (D16, T5, experimental): mesma forma de `NfeDocumentEventActor` (spec 149 D16, H13) —
 * `measured_by_user_id` não tem FK (T2, assimetria deliberada), então quem mediu pode não ter mais
 * membership ativa nesta empresa. `null` nunca acontece aqui (a coluna é `not null`); `{ removed:
 * true }` é "havia um ator, mas ele não é alcançável", sem id nem nome — nunca o id cru.
 */
export type PackageBoxMeasurementActor =
  | {
      readonly id: string
      readonly name: string
    }
  | {
      readonly removed: true
    }

/**
 * Uma linha do histórico append-only, para a validação da Fase 7 (T15) comparar proposta da câmera
 * × gravado. Nunca a descrição do produto nem o CNPJ do emitente (R8) — só o código do produto e o
 * GTIN da caixa identificam de qual caixa se trata.
 */
export type PackageBoxMeasurementExportEntry = {
  readonly cartonGtin: string | null
  readonly createdAt: string
  readonly engine: string | null
  readonly heightMarginMm: number | null
  readonly heightMm: number
  readonly id: string
  readonly impreciseConfirmed: boolean
  readonly lengthMarginMm: number | null
  readonly lengthMm: number
  readonly measuredBy: PackageBoxMeasurementActor
  readonly packageBoxId: string
  readonly productCode: string
  readonly proposedHeightMm: number | null
  readonly proposedLengthMm: number | null
  readonly proposedWidthMm: number | null
  /** T14 (revisão final, ALTO-1): o repositório nunca deixa `replicated` sair daqui (D6). */
  readonly source: PackageBoxMeasurementSource
  readonly warnings: readonly PackageBoxMeasurementWarning[]
  readonly widthMarginMm: number | null
  readonly widthMm: number
}

export type PackageBoxMeasurementExportPage = {
  readonly items: readonly PackageBoxMeasurementExportEntry[]
  readonly nextCursor: string | null
}

export type PackageBoxMeasurementExportRepositoryPort = {
  listMeasurements(input: {
    readonly companyId: string
    readonly cursor: string | null
    /** Inclusivo, sobre `created_at` — `undefined` é "sem piso". */
    readonly from: string | undefined
    readonly limit: number
    /** Inclusivo, sobre `created_at` — `undefined` é "sem teto". */
    readonly to: string | undefined
  }): Promise<PackageBoxMeasurementExportPage>
}
