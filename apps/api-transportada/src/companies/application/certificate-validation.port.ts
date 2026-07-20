/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const CERTIFICATE_REJECTION_CODES = [
  'CERTIFICATE_INVALID',
  'CERTIFICATE_EXPIRED',
  'CERTIFICATE_NOT_YET_VALID',
  'CERTIFICATE_NOT_ICP_BRASIL',
  'CERTIFICATE_PRIVATE_KEY_MISSING',
  'CERTIFICATE_CNPJ_MISSING',
  'CERTIFICATE_SIGNATURE_UNAVAILABLE',
  'CERTIFICATE_VALIDATION_FAILED',
] as const

export type CertificateRejectionCode = (typeof CERTIFICATE_REJECTION_CODES)[number]

export type CertificateValidationInput = {
  readonly certificateBase64: string
  readonly password: string
}

export type CertificateValidationOutcome = {
  readonly valid: boolean
  readonly certificateCnpj?: string
  readonly validFrom?: Date
  readonly expiresAt?: Date
  readonly rejectionCodes: readonly CertificateRejectionCode[]
}

export type CertificateValidationGateway = {
  validate(input: CertificateValidationInput): CertificateValidationOutcome
}
