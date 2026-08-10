/* Copyright (c) 2026 Ada Technology. MIT License. */

export type CertificateUploadStatusKey =
  | 'certificateError'
  | 'certificateErrorForbidden'
  | 'certificateErrorMissingFields'
  | 'certificateErrorNetwork'
  | 'certificateErrorProfileMissing'
  | 'certificateErrorRejected'
  | 'certificateErrorRequestFailed'
  | 'certificateErrorRetry'
  | 'certificateErrorServer'
  | 'certificateErrorStorageUnavailable'

export type CertificateUploadStatus = Readonly<{
  code?: string
  key: CertificateUploadStatusKey
}>

/**
 * A rota colapsa PFX inválido, senha errada, CNPJ de outra empresa e validade fora da janela num
 * `DIGITAL_CERTIFICATE_REJECTED` só, para não virar oráculo sobre certificado alheio. Os
 * `CERTIFICATE_*` que o gateway de validação produz ficam do lado de lá desse colapso e nunca
 * chegam aqui — mapeá-los daria a impressão de tratamento que a tela não tem.
 */
export function resolveCertificateUploadStatus(error: unknown): CertificateUploadStatus {
  const code = error instanceof Error ? error.message : ''
  if (code === 'CERTIFICATE_UPLOAD_REQUIRED') return { key: 'certificateErrorMissingFields' }
  if (code === 'DIGITAL_CERTIFICATE_REJECTED') return { key: 'certificateErrorRejected' }
  if (code === 'DIGITAL_CERTIFICATE_PROFILE_MISSING')
    return { key: 'certificateErrorProfileMissing' }
  if (code === 'IDEMPOTENCY_KEY_REUSED') return { key: 'certificateErrorRetry' }
  if (code === 'DIGITAL_CERTIFICATE_OPERATION_FAILED' || code === 'DIGITAL_CERTIFICATE_UNAVAILABLE')
    return { key: 'certificateErrorStorageUnavailable', code }
  if (code === 'COMPANY_SETTINGS_REQUEST_FAILED')
    return { key: 'certificateErrorRequestFailed', code }
  if (code === 'COMPANY_SETTINGS_NETWORK_ERROR') return { key: 'certificateErrorNetwork' }
  if (code === 'FORBIDDEN' || code === 'UNAUTHENTICATED')
    return { key: 'certificateErrorForbidden', code }
  if (code === 'INTERNAL_ERROR') return { key: 'certificateErrorServer', code }
  return { key: 'certificateError', code: code || 'UNKNOWN_ERROR' }
}
