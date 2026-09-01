/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateAttachmentType } from '../../messaging/aggregate-attachment-envelope.schema.js'

export type AttachmentExtractionPort = Readonly<{
  extract: (input: {
    readonly bytes: Uint8Array
    readonly type: AggregateAttachmentType
  }) => Promise<Readonly<Record<string, unknown>> | null>
}>

export type AttachmentObjectReaderPort = Readonly<{
  read: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array | undefined>
}>

export type AttachmentWriteBackPort = Readonly<{
  saveExtractedFields: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly extractedFields: Readonly<Record<string, unknown>> | null
  }) => Promise<void>
}>
