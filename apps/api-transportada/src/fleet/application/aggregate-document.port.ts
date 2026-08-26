/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateDocumentStatus, AggregateDocumentType } from '../../database/fleet.schema.js'

export type AggregateDocument = Readonly<{
  createdAt: Date
  id: string
  rejectionReason: string
  status: AggregateDocumentStatus
  type: AggregateDocumentType
  updatedAt: Date
}>

export type AggregateDocumentForReview = AggregateDocument & Readonly<{ taxId: string }>

export type AggregateDocumentDownloadLocation = Readonly<{
  bucket: string
  objectKey: string
}>

export type UpsertAggregateDocumentInput = Readonly<{
  bucket: string
  companyId: string
  mimeType: string
  objectKey: string
  provider: string
  sha256: string
  sizeBytes: number
  storedObjectId: string
  taxId: string
  type: AggregateDocumentType
}>

export type ReviewAggregateDocumentInput = Readonly<{
  companyId: string
  id: string
  rejectionReason: string
  reviewedBy: string
  status: 'approved' | 'rejected'
}>

/** O que já foi declarado, pra conferir contra o que o OCR leu — vazio quando o campo nunca foi preenchido. */
export type AggregateDocumentDeclaredFields = Readonly<{
  licenseCategory: string | null
  licenseNumber: string | null
  name: string | null
  plate: string | null
  renavam: string | null
}>

export type AggregateDocumentRepositoryPort = Readonly<{
  findDeclaredFields: (input: {
    readonly companyId: string
    readonly taxId: string
  }) => Promise<AggregateDocumentDeclaredFields>
  findDownloadLocation: (input: {
    readonly companyId: string
    readonly id: string
  }) => Promise<AggregateDocumentDownloadLocation | null>
  listByTaxId: (input: {
    readonly companyId: string
    readonly taxId: string
  }) => Promise<readonly AggregateDocument[]>
  /** Fila de revisão do painel — só o que ainda não foi decidido. */
  listPendingByCompany: (input: {
    readonly companyId: string
  }) => Promise<readonly AggregateDocumentForReview[]>
  /** Aprovação sem revisor humano — `reviewedBy`/`reviewedAt` ficam `null` de propósito, para o
   * painel distinguir "confirmado por OCR" de "revisado por gente". */
  markAutoApproved: (input: { readonly companyId: string; readonly id: string }) => Promise<void>
  review: (input: ReviewAggregateDocumentInput) => Promise<AggregateDocument | null>
  /** Reenvio depois de recusado atualiza a mesma linha — ver comentário do schema. */
  upsert: (input: UpsertAggregateDocumentInput) => Promise<AggregateDocument>
}>

/** Só o que o upload/revisão precisa do storage — o resto de `NfeStorageGateway` não é assunto daqui. */
export type AggregateDocumentStoragePort = Readonly<{
  createSignedDownload: (input: {
    readonly bucket: string
    readonly expiresInSeconds: number
    readonly key: string
  }) => Promise<URL>
  storeObject: (input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }) => Promise<unknown>
}>
