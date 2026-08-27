/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateApplicationAttachmentType } from '../../database/aggregate-application.schema.js'

export type CreateAggregateApplicationAttachmentDraftInput = Readonly<{
  bucket: string
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
