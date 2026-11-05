/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CnhFaceResult } from '../domain/cnh-face.types.js'

export type CnhFaceExtractionPort = Readonly<{
  extract: (bytes: Uint8Array) => Promise<CnhFaceResult>
}>

export type CnhProfilePicturePort = Readonly<{
  /** `applied: false` quando a pessoa já tem foto própria ou do escritório, ou ainda não tem usuário. */
  apply: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly image: Uint8Array
  }) => Promise<{ readonly applied: boolean }>
}>
