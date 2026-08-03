/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyLogoMimeType } from '../../database/company-logo.schema.js'

export type CompanyLogoMetadata = {
  readonly byteSize: number
  readonly mimeType: CompanyLogoMimeType
  readonly sha256: string
  readonly updatedAt: Date
}

export type CompanyLogo = CompanyLogoMetadata & {
  readonly bytes: Buffer
}

export type SaveCompanyLogoInput = {
  readonly byteSize: number
  readonly companyId: string
  readonly contentBase64: string
  readonly mimeType: CompanyLogoMimeType
  readonly sha256: string
}

export type CompanyLogoRepositoryPort = {
  readonly find: (input: { readonly companyId: string }) => Promise<CompanyLogo | null>
  readonly remove: (input: { readonly companyId: string }) => Promise<boolean>
  readonly save: (input: SaveCompanyLogoInput) => Promise<CompanyLogoMetadata>
}
