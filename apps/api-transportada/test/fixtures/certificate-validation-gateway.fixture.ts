/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { spyOn } from 'bun:test'
import type { CertificateValidation } from '@adatechnology/fiscal-provider'
import { Logger } from '@adatechnology/logger'

export const CERTIFICATE_INPUT = {
  certificateBase64: 'synthetic-certificate-base64',
  password: 'synthetic-password',
} as const

const PROVIDER_DIAGNOSTIC = 'provider diagnostic must stay internal'

export const ACCEPTED_VALIDATION = {
  canSign: true,
  cnpj: '11222333000181',
  errors: [],
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  hasClientAuth: true,
  hasCnpj: true,
  hasCpf: false,
  hasPrivateKey: true,
  isExpired: false,
  isIcpBrasil: true,
  isNotYetValid: false,
  issuer: 'provider issuer must stay internal',
  subject: 'provider subject must stay internal',
  valid: true,
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  warnings: [],
} satisfies CertificateValidation

const validationWith = (overrides: Partial<CertificateValidation>): CertificateValidation => ({
  ...ACCEPTED_VALIDATION,
  ...overrides,
})

const createValidationWithoutCnpj = (
  overrides: Partial<CertificateValidation> = {},
): CertificateValidation => {
  const validation = validationWith(overrides)
  const { cnpj, ...validationWithoutCnpj } = validation
  void cnpj
  return validationWithoutCnpj
}

const PROVIDER_OPEN_FAILURE_VALIDATION = {
  canSign: false,
  errors: [PROVIDER_DIAGNOSTIC],
  expiresAt: new Date(0),
  hasClientAuth: false,
  hasCnpj: false,
  hasCpf: false,
  hasPrivateKey: false,
  isExpired: false,
  isIcpBrasil: false,
  isNotYetValid: false,
  issuer: '',
  subject: '',
  valid: false,
  validFrom: new Date(0),
  warnings: [],
} satisfies CertificateValidation

const SPECIFIC_REJECTION_SCENARIOS = [
  {
    expectedCode: 'CERTIFICATE_EXPIRED',
    name: 'certificate is expired',
    overrides: { isExpired: true },
  },
  {
    expectedCode: 'CERTIFICATE_NOT_YET_VALID',
    name: 'certificate is not yet valid',
    overrides: { isNotYetValid: true },
  },
  {
    expectedCode: 'CERTIFICATE_NOT_ICP_BRASIL',
    name: 'certificate is not ICP-Brasil',
    overrides: { isIcpBrasil: false },
  },
  {
    expectedCode: 'CERTIFICATE_PRIVATE_KEY_MISSING',
    name: 'certificate has no private key',
    overrides: { hasPrivateKey: false },
  },
  {
    expectedCode: 'CERTIFICATE_SIGNATURE_UNAVAILABLE',
    name: 'certificate cannot sign',
    overrides: { canSign: false },
  },
] as const

const specificRejectionScenarios = SPECIFIC_REJECTION_SCENARIOS.flatMap(
  ({ expectedCode, name, overrides }) => [
    {
      expectedCode,
      name: `${name} despite valid=true`,
      validation: validationWith(overrides),
    },
    {
      expectedCode,
      name: `${name} in a provider-realistic invalid result`,
      validation: validationWith({
        ...overrides,
        errors: [PROVIDER_DIAGNOSTIC],
        valid: false,
      }),
    },
  ],
)

export const REJECTION_SCENARIOS = [
  {
    expectedCode: 'CERTIFICATE_INVALID',
    name: 'provider cannot open the PFX or password',
    validation: PROVIDER_OPEN_FAILURE_VALIDATION,
  },
  {
    expectedCode: 'CERTIFICATE_INVALID',
    name: 'provider marks the certificate invalid',
    validation: validationWith({
      errors: [PROVIDER_DIAGNOSTIC],
      valid: false,
      warnings: [PROVIDER_DIAGNOSTIC],
    }),
  },
  ...specificRejectionScenarios,
  {
    expectedCode: 'CERTIFICATE_CNPJ_MISSING',
    name: 'provider reports no CNPJ despite valid=true',
    validation: createValidationWithoutCnpj({ hasCnpj: false }),
  },
  {
    expectedCode: 'CERTIFICATE_CNPJ_MISSING',
    name: 'provider reports no CNPJ in a realistic invalid result',
    validation: createValidationWithoutCnpj({
      errors: [PROVIDER_DIAGNOSTIC],
      hasCnpj: false,
      valid: false,
    }),
  },
  {
    expectedCode: 'CERTIFICATE_CNPJ_MISSING',
    name: 'provider omits the CNPJ value despite hasCnpj=true',
    validation: createValidationWithoutCnpj(),
  },
] as const

export function installDiagnosticSpies(): {
  readonly events: readonly unknown[]
  readonly restore: () => void
} {
  const events: unknown[] = []
  const capture = (...input: unknown[]): void => {
    events.push(input)
  }
  const spies = [
    spyOn(console, 'debug').mockImplementation(capture),
    spyOn(console, 'error').mockImplementation(capture),
    spyOn(console, 'info').mockImplementation(capture),
    spyOn(console, 'log').mockImplementation(capture),
    spyOn(console, 'warn').mockImplementation(capture),
    spyOn(Logger.prototype, 'debug').mockImplementation(capture),
    spyOn(Logger.prototype, 'error').mockImplementation(capture),
    spyOn(Logger.prototype, 'info').mockImplementation(capture),
    spyOn(Logger.prototype, 'warn').mockImplementation(capture),
  ]

  return {
    events,
    restore() {
      for (const spy of spies) spy.mockRestore()
    },
  }
}
