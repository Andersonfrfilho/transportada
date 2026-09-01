/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateApplicationAttachmentType } from '../../database/aggregate-application.schema.js'

export type CreateAggregateApplicationAttachmentDraftInput = Readonly<{
  bucket: string
  /** O que a leitura do servidor achou; `null` quando não houve leitura ou nada foi reconhecido. */
  extractedFields: Readonly<Record<string, unknown>> | null
  companyId: string
  draftId: string
  mimeType: string
  objectKey: string
  provider: string
  sha256: string
  sizeBytes: number
  type: AggregateApplicationAttachmentType
}>

export type AggregateApplicationAttachmentDraft = Readonly<{
  draftId: string
  type: AggregateApplicationAttachmentType
}>

export type AggregateApplicationAttachmentRepositoryPort = Readonly<{
  createDraft: (
    input: CreateAggregateApplicationAttachmentDraftInput,
  ) => Promise<AggregateApplicationAttachmentDraft>
}>
