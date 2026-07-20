/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, spyOn, test } from 'bun:test'
import type { CertificateValidation } from '@adatechnology/fiscal-provider'

import {
  ACCEPTED_VALIDATION,
  CERTIFICATE_INPUT,
  installDiagnosticSpies,
  REJECTION_SCENARIOS,
} from './fixtures/certificate-validation-gateway.fixture'

describe('public fiscal certificate validation gateway contract', () => {
  test('pins the audited fiscal and storage packages exactly', async () => {
    const packageManifest = (await Bun.file(
      new URL('../package.json', import.meta.url),
    ).json()) as {
      readonly dependencies?: Readonly<Record<string, string>>
    }

    expect(packageManifest.dependencies?.['@adatechnology/fiscal-provider']).toBe('0.2.0')
    expect(packageManifest.dependencies?.['@adatechnology/object-storage-provider']).toBe('0.1.1')
  })

  test('compiles validateCertificate and its result type from the package root', async () => {
    const { validateCertificate } = await import('@adatechnology/fiscal-provider')
    const publicValidator: (certificateBase64: string, password: string) => CertificateValidation =
      validateCertificate

    expect(typeof publicValidator).toBe('function')
  })

  test('adapts only the public validator to fail-closed safe outcomes', async () => {
    const fiscalProvider = await import('@adatechnology/fiscal-provider')
    const publicValidatorInputs: Array<{
      readonly certificateBase64: string
      readonly password: string
    }> = []
    const publicValidatorSpy = spyOn(fiscalProvider, 'validateCertificate').mockImplementation(
      (certificateBase64, password) => {
        publicValidatorInputs.push({ certificateBase64, password })
        return ACCEPTED_VALIDATION
      },
    )
    const diagnostics = installDiagnosticSpies()

    try {
      const { createFiscalCertificateValidationGateway } = await import(
        '../src/companies/infrastructure/fiscal-certificate-validation.gateway.js'
      )
      const gatewaySource = await Bun.file(
        new URL(
          '../src/companies/infrastructure/fiscal-certificate-validation.gateway.ts',
          import.meta.url,
        ),
      ).text()
      expect(gatewaySource).toMatch(/from ['"]@adatechnology\/fiscal-provider['"]/)
      expect(gatewaySource).not.toContain('@adatechnology/fiscal-provider/')
      expect(gatewaySource).not.toContain('src/sefaz')

      const defaultGateway = createFiscalCertificateValidationGateway()
      const safeOutcomes: unknown[] = []
      const defaultOutcome = defaultGateway.validate(CERTIFICATE_INPUT)
      safeOutcomes.push(defaultOutcome)
      expect(defaultOutcome).toEqual({
        certificateCnpj: ACCEPTED_VALIDATION.cnpj,
        expiresAt: ACCEPTED_VALIDATION.expiresAt,
        rejectionCodes: [],
        valid: true,
        validFrom: ACCEPTED_VALIDATION.validFrom,
      })
      expect(publicValidatorInputs).toEqual([CERTIFICATE_INPUT])
      expect(publicValidatorSpy).toHaveBeenCalledTimes(1)

      for (const scenario of REJECTION_SCENARIOS) {
        const gateway = createFiscalCertificateValidationGateway({
          validateCertificate() {
            return scenario.validation
          },
        })
        const outcome = gateway.validate(CERTIFICATE_INPUT)
        safeOutcomes.push(outcome)

        expect(outcome.valid, scenario.name).toBeFalse()
        expect(outcome.rejectionCodes, scenario.name).toEqual([scenario.expectedCode])
        expect(JSON.stringify(outcome), scenario.name).not.toContain('provider diagnostic')
      }

      const failedGateway = createFiscalCertificateValidationGateway({
        validateCertificate() {
          throw new Error('provider diagnostic must stay internal')
        },
      })
      const failedOutcome = failedGateway.validate(CERTIFICATE_INPUT)
      safeOutcomes.push(failedOutcome)
      expect(failedOutcome).toEqual({
        rejectionCodes: ['CERTIFICATE_VALIDATION_FAILED'],
        valid: false,
      })

      for (const outcome of safeOutcomes) {
        expect(outcome).not.toHaveProperty('errors')
        expect(outcome).not.toHaveProperty('warnings')
        expect(outcome).not.toHaveProperty('issuer')
        expect(outcome).not.toHaveProperty('subject')
        expect(outcome).not.toHaveProperty('hasPrivateKey')
        expect(outcome).not.toHaveProperty('canSign')
      }
      expect(diagnostics.events).toEqual([])
    } finally {
      publicValidatorSpy.mockRestore()
      diagnostics.restore()
    }
  })
})
