/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './companySettingsResponse.validation'
import type { CompanyLogoMetadata } from './companySettings.types'

export const COMPANY_LOGO_MAX_BYTES = 262_144
export const COMPANY_LOGO_MIME_TYPES = ['image/jpeg', 'image/png'] as const
export const COMPANY_LOGO_ACCEPT = COMPANY_LOGO_MIME_TYPES.join(',')
export const COMPANY_LOGO_FIELD = 'file'

export function isCompanyLogoMimeType(value: string): boolean {
  return COMPANY_LOGO_MIME_TYPES.some((mimeType) => mimeType === value)
}

/** Recusa no navegador o que a API recusaria, para o usuário não esperar um upload perdido. */
export function resolveLogoRejection(file: File): string | null {
  if (!isCompanyLogoMimeType(file.type)) return 'COMPANY_LOGO_UNSUPPORTED_FORMAT'
  if (file.size > COMPANY_LOGO_MAX_BYTES) return 'COMPANY_LOGO_TOO_LARGE'
  return null
}

export function isCompanyLogoMetadata(value: unknown): value is CompanyLogoMetadata {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== 4) return false
  return (
    typeof value.byteSize === 'number' &&
    typeof value.mimeType === 'string' &&
    typeof value.sha256 === 'string' &&
    typeof value.updatedAt === 'string'
  )
}
