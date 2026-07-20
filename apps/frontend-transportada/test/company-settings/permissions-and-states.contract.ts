/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  COMPANY_SETTINGS_UPDATE,
  DIGITAL_CERTIFICATES_RESPONSE,
  EMPTY_COMPANY_SETTINGS_RESPONSE,
  SETTINGS_MANAGE,
  type CompanySettingsUpdateContract,
  loadFutureModule,
} from './company-settings.fixture'

describe('company settings permissions and states contract', () => {
  test('shows mutation controls only to settings.manage and never calls mutations otherwise', async () => {
    const { createCompanySettingsController } = await loadFutureModule<CompanySettingsHookModule>(
      '../../src/modules/company-settings/hooks/useCompanySettings.hook',
    )
    const client = createMutationRecordingClient()
    const controller = createCompanySettingsController({ client, permissions: [] })

    expect(controller.canManageSettings).toBe(false)
    const saveError = await controller
      .save(COMPANY_SETTINGS_UPDATE)
      .catch((caught: unknown) => caught)
    const certificateError = await controller
      .replaceCertificate(new FormData())
      .catch((caught: unknown) => caught)

    expect(saveError).toEqual(expect.objectContaining({ message: 'COMPANY_SETTINGS_FORBIDDEN' }))
    expect(certificateError).toEqual(
      expect.objectContaining({ message: 'COMPANY_SETTINGS_FORBIDDEN' }),
    )
    expect(client.mutationCount).toBe(0)
    expect(
      createCompanySettingsController({ client, permissions: [SETTINGS_MANAGE] }).canManageSettings,
    ).toBe(true)
  })

  test('maps loading, empty, error and success without exposing unsafe certificate fields', async () => {
    const { createCompanySettingsViewModel } =
      await loadFutureModule<CompanySettingsViewModelModule>(
        '../../src/modules/company-settings/shared/companySettingsViewModel.service',
      )

    expect(createCompanySettingsViewModel({ status: 'loading' })).toEqual({ status: 'loading' })
    expect(
      createCompanySettingsViewModel({ data: EMPTY_COMPANY_SETTINGS_RESPONSE, status: 'success' }),
    ).toEqual({
      status: 'empty',
    })
    expect(createCompanySettingsViewModel({ status: 'error' })).toEqual({ status: 'error' })

    const viewModel = createCompanySettingsViewModel({
      certificates: DIGITAL_CERTIFICATES_RESPONSE,
      data: COMPANY_SETTINGS_RESPONSE,
      status: 'success',
    })
    expect(viewModel.status).toBe('success')
    expect(viewModel.environment).toBe('production')
    expect(viewModel.canIssueInProduction).toBe(false)
    expect(Object.keys(viewModel.activeCertificate ?? {})).toEqual([
      'id',
      'status',
      'purpose',
      'validFrom',
      'expiresAt',
      'version',
    ])
  })
})

function createMutationRecordingClient(): CompanySettingsClient & {
  readonly mutationCount: number
} {
  let mutationCount = 0
  return {
    get mutationCount(): number {
      return mutationCount
    },
    getSettings: () => Promise.resolve(COMPANY_SETTINGS_RESPONSE),
    listCertificates: () => Promise.resolve(DIGITAL_CERTIFICATES_RESPONSE),
    replaceCertificate: () => {
      mutationCount += 1
      return Promise.resolve({})
    },
    updateSettings: () => {
      mutationCount += 1
      return Promise.resolve({})
    },
  }
}

type CompanySettingsClient = {
  readonly getSettings: () => Promise<unknown>
  readonly listCertificates: () => Promise<unknown>
  readonly replaceCertificate: (body: FormData) => Promise<unknown>
  readonly updateSettings: (input: CompanySettingsUpdateContract) => Promise<unknown>
}

type CompanySettingsController = {
  readonly canManageSettings: boolean
  readonly replaceCertificate: (body: FormData) => Promise<void>
  readonly save: (input: CompanySettingsUpdateContract) => Promise<void>
}

type CompanySettingsHookModule = {
  readonly createCompanySettingsController: (input: {
    readonly client: CompanySettingsClient
    readonly permissions: readonly string[]
  }) => CompanySettingsController
}

type CompanySettingsViewModelModule = {
  readonly createCompanySettingsViewModel: (input: {
    readonly certificates?: unknown
    readonly data?: unknown
    readonly status: 'error' | 'loading' | 'success'
  }) => CompanySettingsViewModel
}

type CompanySettingsViewModel = {
  readonly activeCertificate?: Record<string, unknown>
  readonly canIssueInProduction?: boolean
  readonly environment?: string
  readonly status: 'empty' | 'error' | 'loading' | 'success'
}
