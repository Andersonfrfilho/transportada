/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CertificateUploadController } from '../../src/modules/company-settings/hooks/useCertificateUpload.hook'
import type {
  CompanySettingsClient,
  CompanySettingsController,
} from '../../src/modules/company-settings/hooks/useCompanySettings.hook'
import type {
  CompanySettingsClientFactory,
  CompanySettingsUpdate,
} from '../../src/modules/company-settings/shared/companySettingsClient.service'
import type { CompanySettingsViewModelFactory } from '../../src/modules/company-settings/shared/companySettingsViewModel.service'
import type { CompanySettingsUpdateContract } from './company-settings.fixture'

type Assert<TValue extends true> = TValue
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false

export type CompanySettingsUpdateIsExact = Assert<
  Equal<CompanySettingsUpdate, CompanySettingsUpdateContract>
>

export type CompanySettingsModuleContracts = {
  readonly certificateUploadController: CertificateUploadController
  readonly companySettingsClient: CompanySettingsClient
  readonly companySettingsClientFactory: CompanySettingsClientFactory
  readonly companySettingsController: CompanySettingsController
  readonly companySettingsUpdate: CompanySettingsUpdate
  readonly companySettingsViewModelFactory: CompanySettingsViewModelFactory
}
