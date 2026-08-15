/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { validateCertificate, type CertificateValidation } from '@adatechnology/fiscal-provider'

import type {
  CertificateRejectionCode,
  CertificateValidationGateway,
  CertificateValidationInput,
  CertificateValidationOutcome,
} from '../application/certificate-validation.port'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'

type FiscalCertificateValidator = {
  readonly validateCertificate: (
    certificateBase64: string,
    password: string,
  ) => CertificateValidation
}

const PUBLIC_FISCAL_VALIDATOR: FiscalCertificateValidator = {
  validateCertificate,
}

export function createFiscalCertificateValidationGateway(
  validator: FiscalCertificateValidator = PUBLIC_FISCAL_VALIDATOR,
): CertificateValidationGateway {
  return {
    validate(input) {
      return validateLocally({ input, validator })
    },
  }
}

type ValidateLocallyParams = {
  readonly input: CertificateValidationInput
  readonly validator: FiscalCertificateValidator
}

function validateLocally({
  input,
  validator,
}: ValidateLocallyParams): CertificateValidationOutcome {
  try {
    const validation = validator.validateCertificate(input.certificateBase64, input.password)
    const rejectionCode = findRejectionCode(validation)
    if (rejectionCode) return rejected(rejectionCode)
    const certificateCnpj = validation.cnpj
    if (!isCanonicalCnpj(certificateCnpj)) {
      return rejected('CERTIFICATE_VALIDATION_FAILED')
    }

    return Object.freeze({
      certificateCnpj,
      expiresAt: new Date(validation.expiresAt.getTime()),
      rejectionCodes: Object.freeze([]),
      valid: true,
      validFrom: new Date(validation.validFrom.getTime()),
    })
  } catch {
    return rejected('CERTIFICATE_VALIDATION_FAILED')
  }
}

function findRejectionCode(
  validation: CertificateValidation,
): CertificateRejectionCode | undefined {
  if (!isValidDate(validation.validFrom) || !isValidDate(validation.expiresAt)) {
    return 'CERTIFICATE_VALIDATION_FAILED'
  }
  if (isUnopenedCertificate(validation)) return 'CERTIFICATE_INVALID'
  if (validation.isExpired) return 'CERTIFICATE_EXPIRED'
  if (validation.isNotYetValid) return 'CERTIFICATE_NOT_YET_VALID'
  if (!validation.isIcpBrasil) return 'CERTIFICATE_NOT_ICP_BRASIL'
  if (!validation.hasPrivateKey) return 'CERTIFICATE_PRIVATE_KEY_MISSING'
  if (!validation.hasCnpj || !isCanonicalCnpj(validation.cnpj)) {
    return 'CERTIFICATE_CNPJ_MISSING'
  }
  if (!validation.canSign) return 'CERTIFICATE_SIGNATURE_UNAVAILABLE'
  if (!validation.valid || validation.errors.length > 0) return 'CERTIFICATE_INVALID'
  return undefined
}

function isUnopenedCertificate(validation: CertificateValidation): boolean {
  return (
    validation.validFrom.getTime() === 0 &&
    validation.expiresAt.getTime() === 0 &&
    !validation.isExpired &&
    !validation.isNotYetValid &&
    validation.issuer === '' &&
    validation.subject === ''
  )
}

function isCanonicalCnpj(value: string | undefined): value is string {
  return value !== undefined && CNPJ_PATTERN.test(value)
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function rejected(code: CertificateRejectionCode): CertificateValidationOutcome {
  return Object.freeze({
    rejectionCodes: Object.freeze([code]),
    valid: false,
  })
}
