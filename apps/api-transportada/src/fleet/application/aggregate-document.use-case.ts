/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomUUID } from 'node:crypto'

import { AGGREGATE_DOCUMENT_TYPES, type AggregateDocumentType } from '../../database/fleet.schema.js'
import {
  extractCnhFields,
  extractCrlvFields,
  scoreAggregateDocumentMatch,
  type ExtractedCnhFields,
  type ExtractedCrlvFields,
} from '../domain/aggregate-document-ocr.policy.js'
import { assertAggregateDocumentBytes } from '../domain/aggregate-document.policy.js'
import type { AggregateDocumentOcrPort } from './aggregate-document-ocr.port.js'
import type {
  AggregateDocument,
  AggregateDocumentRepositoryPort,
  AggregateDocumentStoragePort,
} from './aggregate-document.port.js'

type Dependencies = {
  readonly bucket: string
  /** Ausente, o upload nunca extrai nem aprova sozinho — cai sempre na revisão manual. */
  readonly ocr?: AggregateDocumentOcrPort
  readonly repository: AggregateDocumentRepositoryPort
  readonly storage: AggregateDocumentStoragePort
}

export type AggregateDocumentListItem = Readonly<{
  document: AggregateDocument | null
  type: AggregateDocumentType
}>

export type AggregateDocumentUploadResult = AggregateDocument &
  Readonly<{
    /** `null` sem OCR configurado, ou quando o texto não teve nada reconhecível. */
    extracted: ExtractedCnhFields | ExtractedCrlvFields | null
  }>

export type AggregateDocumentUseCase = Readonly<{
  list: (input: { readonly companyId: string; readonly taxId: string }) => Promise<readonly AggregateDocumentListItem[]>
  upload: (input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly taxId: string
    readonly type: AggregateDocumentType
  }) => Promise<AggregateDocumentUploadResult>
}>

const STORAGE_PROVIDER = 'object-storage'

export function buildAggregateDocumentObjectKey(input: {
  readonly companyId: string
  readonly objectId: string
  readonly taxId: string
  readonly type: AggregateDocumentType
}): string {
  return `tenants/${input.companyId}/aggregate-documents/${input.taxId}/${input.type}/${input.objectId}`
}

export function createAggregateDocumentUseCase(dependencies: Dependencies): AggregateDocumentUseCase {
  return {
    async list({ companyId, taxId }) {
      const documents = await dependencies.repository.listByTaxId({ companyId, taxId })
      return AGGREGATE_DOCUMENT_TYPES.map((type) => ({
        document: documents.find((document) => document.type === type) ?? null,
        type,
      }))
    },

    async upload({ bytes, companyId, taxId, type }) {
      const mimeType = assertAggregateDocumentBytes(bytes)
      const objectId = randomUUID()
      const key = buildAggregateDocumentObjectKey({ companyId, objectId, taxId, type })
      const sha256 = createHash('sha256').update(bytes).digest('hex')

      await dependencies.storage.storeObject({
        body: bytes,
        bucket: dependencies.bucket,
        contentLength: bytes.byteLength,
        contentType: mimeType,
        key,
        sha256,
      })

      const document = await dependencies.repository.upsert({
        bucket: dependencies.bucket,
        companyId,
        mimeType,
        objectKey: key,
        provider: STORAGE_PROVIDER,
        sha256,
        sizeBytes: bytes.byteLength,
        storedObjectId: objectId,
        taxId,
        type,
      })

      // O serviço de OCR só lê imagem raster — chamar com PDF é round-trip perdido, sabendo que
      // vai falhar (ver comentário do gateway HTTP).
      if (dependencies.ocr === undefined || mimeType === 'application/pdf') {
        return { ...document, extracted: null }
      }

      const extracted = await runOcrAndMaybeApprove({
        bytes,
        companyId,
        document,
        mimeType,
        ocr: dependencies.ocr,
        repository: dependencies.repository,
        taxId,
        type,
      })
      return extracted
    },
  }
}

async function runOcrAndMaybeApprove(input: {
  readonly bytes: Uint8Array
  readonly companyId: string
  readonly document: AggregateDocument
  readonly mimeType: string
  readonly ocr: AggregateDocumentOcrPort
  readonly repository: AggregateDocumentRepositoryPort
  readonly taxId: string
  readonly type: AggregateDocumentType
}): Promise<AggregateDocumentUploadResult> {
  // OCR indisponível ou falhando não pode derrubar o upload — o documento já está salvo, e a
  // revisão manual continua funcionando; só a aprovação automática fica de fora desta vez.
  const text = await input.ocr.extractText({ bytes: input.bytes, mimeType: input.mimeType }).catch(() => null)
  if (text === null) return { ...input.document, extracted: null }

  if (input.type === 'cnh') {
    const extracted = extractCnhFields(text)
    const declared = await input.repository.findDeclaredFields({ companyId: input.companyId, taxId: input.taxId })
    const outcome = scoreAggregateDocumentMatch({
      declared: [declared.name, declared.licenseNumber, declared.licenseCategory],
      extracted: [extracted.name, extracted.licenseNumber, extracted.licenseCategory],
    })
    if (outcome.confidence === 'high') {
      await input.repository.markAutoApproved({ companyId: input.companyId, id: input.document.id })
      return { ...input.document, extracted, status: 'approved' }
    }
    return { ...input.document, extracted }
  }

  const extracted = extractCrlvFields(text)
  const declared = await input.repository.findDeclaredFields({ companyId: input.companyId, taxId: input.taxId })
  const outcome = scoreAggregateDocumentMatch({
    declared: [declared.plate, declared.renavam],
    extracted: [extracted.plate, extracted.renavam],
  })
  if (outcome.confidence === 'high') {
    await input.repository.markAutoApproved({ companyId: input.companyId, id: input.document.id })
    return { ...input.document, extracted, status: 'approved' }
  }
  return { ...input.document, extracted }
}
