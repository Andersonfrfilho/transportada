/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  DUAL_PURPOSE_CERTIFICATES_RESPONSE,
  SAFE_CERTIFICATE,
  SAFE_MDFE_CERTIFICATE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
  syntheticCertificateFile,
} from './company-settings.fixture'

type CertificateUploadModule = {
  readonly createCertificateUploadController: (input: {
    readonly clearFileInput: () => void
    readonly clearPasswordInput: () => void
    readonly replaceCertificate: (body: FormData) => Promise<void>
  }) => {
    readonly hasSensitiveDraft: boolean
    readonly selectCertificate: (file: File) => void
    readonly setPassword: (password: string) => void
    readonly setPurpose: (purpose: 'cte' | 'mdfe') => void
    readonly submit: () => Promise<void>
  }
}

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly retireCertificate: (purpose: 'cte' | 'mdfe') => Promise<void>
  }
}

type ViewModelModule = {
  readonly createCompanySettingsViewModel: (input: {
    readonly certificates?: unknown
    readonly data?: unknown
    readonly status: 'error' | 'loading' | 'success'
  }) => {
    readonly activeCertificates: Readonly<Record<string, Record<string, unknown> | undefined>>
  }
}

describe('company settings certificate purpose contract', () => {
  test('uploads the certificate under the selected purpose', async () => {
    const { createCertificateUploadController } = await loadFutureModule<CertificateUploadModule>(
      '../../src/modules/company-settings/hooks/useCertificateUpload.hook',
    )
    for (const purpose of ['cte', 'mdfe'] as const) {
      const replaceCertificate = mock((body: FormData) => {
        expect([...body.keys()]).toEqual(['certificate', 'password', 'purpose'])
        expect(body.get('purpose')).toBe(purpose)
        return Promise.resolve()
      })
      const controller = createCertificateUploadController({
        clearFileInput: () => undefined,
        clearPasswordInput: () => undefined,
        replaceCertificate,
      })

      controller.selectCertificate(syntheticCertificateFile())
      controller.setPassword('synthetic-password')
      controller.setPurpose(purpose)
      await controller.submit()

      expect(replaceCertificate).toHaveBeenCalledTimes(1)
    }
  })

  // Sem o purpose na query a API aposenta o certificado errado e derruba a emissão do outro documento
  test('names the purpose when retiring a certificate', async () => {
    const { createCompanySettingsClient } = await loadFutureModule<CompanySettingsClientModule>(
      '../../src/modules/company-settings/shared/companySettingsClient.service',
    )
    for (const purpose of ['cte', 'mdfe'] as const) {
      const fetch = mock((request: Request): Promise<Response> => {
        expect(request.method).toBe('DELETE')
        expect(request.url).toBe(
          `https://transportada.test/digital-certificates?purpose=${purpose}`,
        )
        return Promise.resolve(Response.json({ data: null }))
      })
      const client = createCompanySettingsClient({
        apiBaseUrl: 'https://transportada.test',
        fetch,
        getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
        newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
      })

      await client.retireCertificate(purpose)

      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  // Um único certificado "ativo" esconde qual documento fiscal está sem certificado
  test('separates the active certificate of each purpose', async () => {
    const { createCompanySettingsViewModel } = await loadFutureModule<ViewModelModule>(
      '../../src/modules/company-settings/shared/companySettingsViewModel.service',
    )

    const viewModel = createCompanySettingsViewModel({
      certificates: DUAL_PURPOSE_CERTIFICATES_RESPONSE,
      data: COMPANY_SETTINGS_RESPONSE,
      status: 'success',
    })

    expect(viewModel.activeCertificates).toEqual({
      cte: SAFE_CERTIFICATE,
      mdfe: SAFE_MDFE_CERTIFICATE,
    })
  })

  test('leaves a purpose without an active certificate undefined', async () => {
    const { createCompanySettingsViewModel } = await loadFutureModule<ViewModelModule>(
      '../../src/modules/company-settings/shared/companySettingsViewModel.service',
    )

    const viewModel = createCompanySettingsViewModel({
      certificates: { data: [SAFE_CERTIFICATE], page: { nextCursor: null } },
      data: COMPANY_SETTINGS_RESPONSE,
      status: 'success',
    })

    expect(viewModel.activeCertificates.mdfe).toBeUndefined()
    expect(viewModel.activeCertificates.cte).toEqual(SAFE_CERTIFICATE)
  })
})
