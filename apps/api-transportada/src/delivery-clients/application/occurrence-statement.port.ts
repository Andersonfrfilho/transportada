/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29). O demonstrativo é **artefato imutável gerado no fechamento**, guardado em
 * `stored_objects` com propósito e prazo próprios, e servido de lá — nunca recomputado na leitura.
 * Recomputar resolveria mal quatro riscos de uma vez (`plan.md` § "O demonstrativo é artefato
 * imutável"): a foto pode ter sido expurgada pela spec 161, que é cega à cobrança; o total poderia
 * ser relido diferente; dezenas de downloads do bucket dentro da requisição estouram o prazo; e o
 * arquivo cresceria sem teto.
 */
import type { DeliveryChargeType } from '../../database/delivery-client.schema.js'

export const EXTRA_CHARGE_BATCH_STATEMENT_PURPOSE = 'extra_charge_batch_statement'
export const EXTRA_CHARGE_BATCH_STATEMENT_CONTENT_TYPE = 'application/pdf'

/**
 * Cinco anos, e é mais do que a foto original guarda de propósito: enquanto o demonstrativo existe,
 * a prova sobrevive ao expurgo do anexo — é essa a mitigação escrita no `plan.md`.
 */
export const EXTRA_CHARGE_BATCH_STATEMENT_RETENTION_DAYS = 1826

export type OccurrenceStatementPhotoReference = {
  readonly bucket: string
  /** O anexo já saiu do prazo de guarda (ou foi apagado): vira selo textual, nunca imagem quebrada. */
  readonly expired: boolean
  readonly mimeType: string
  readonly objectKey: string
}

export type OccurrenceStatementChargeRow = {
  readonly accessKey: string | null
  readonly amount: string
  readonly chargeType: DeliveryChargeType
  readonly chargedOn: string
  readonly clientName: string
  readonly id: string
  readonly notes: string
  readonly noteNumber: string | null
  readonly noteSeries: string | null
  /** A foto de menor `position` da ocorrência, preferindo a miniatura quando existe. */
  readonly photo: OccurrenceStatementPhotoReference | null
  readonly photoCount: number
  readonly productCodes: readonly string[]
}

export type OccurrenceStatementBatchRecord = {
  readonly closedAt: Date
  readonly companyId: string
  readonly contractorName: string
  readonly id: string
  readonly periodEnd: string
  readonly periodStart: string
  readonly statementObjectId: string | null
  readonly totalAmount: string
}

export type OccurrenceStatementCarrierRecord = {
  readonly legalName: string
  readonly taxLine: string
}

export type OccurrenceStatementObjectRecord = {
  readonly bucket: string
  readonly mimeType: string
  readonly objectKey: string
}

export type OccurrenceStatementRepositoryPort = {
  readonly findBatch: (input: {
    readonly batchId: string
    readonly companyId: string
  }) => Promise<OccurrenceStatementBatchRecord | null>
  readonly findCarrier: (input: {
    readonly companyId: string
  }) => Promise<OccurrenceStatementCarrierRecord>
  readonly findStatementObject: (input: {
    readonly companyId: string
    readonly objectId: string
  }) => Promise<OccurrenceStatementObjectRecord | null>
  readonly listChargeRows: (input: {
    readonly batchId: string
    readonly companyId: string
  }) => Promise<readonly OccurrenceStatementChargeRow[]>
  readonly saveStatement: (input: {
    readonly batchId: string
    readonly bucket: string
    readonly companyId: string
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly provider: string
    readonly retentionUntil: Date
    readonly sha256: string
    readonly sizeBytes: bigint
  }) => Promise<void>
}

export type OccurrenceStatementArchivePort = {
  /** `null` quando o objeto sumiu do bucket — a foto vira selo, e o demonstrativo continua. */
  readonly loadObject: (input: {
    readonly bucket: string
    readonly objectKey: string
  }) => Promise<Uint8Array | null>
  readonly put: (input: {
    readonly batchId: string
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly contentType: string
    readonly objectId: string
    readonly sha256: string
  }) => Promise<{
    readonly bucket: string
    readonly objectKey: string
    readonly provider: string
  }>
}

export type OccurrenceStatementDocument = {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly fileName: string
}
