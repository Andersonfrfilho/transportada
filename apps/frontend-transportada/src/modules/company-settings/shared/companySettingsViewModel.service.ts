/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CompanySettingsResponse,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettingsClient.service'

export type CompanySettingsViewModel = Readonly<{
  activeCertificate?: SafeCertificate
  canIssueInProduction?: false
  environment?: 'homologation' | 'production'
  status: 'empty' | 'error' | 'loading' | 'success'
}>

type ViewModelInput = Readonly<{
  certificates?: DigitalCertificatesResponse
  data?: CompanySettingsResponse
  status: 'error' | 'loading' | 'success'
}>

export type CompanySettingsViewModelFactory = (input: ViewModelInput) => CompanySettingsViewModel

export const createCompanySettingsViewModel: CompanySettingsViewModelFactory = (input) => {
  if (input.status !== 'success') return { status: input.status }
  const settings = input.data?.data
  if (settings?.profile === null || settings?.cte === null || settings === undefined)
    return { status: 'empty' }
  const activeCertificate = input.certificates?.data.find(({ status }) => status === 'active')
  const safeCertificate =
    activeCertificate === undefined
      ? undefined
      : {
          id: activeCertificate.id,
          status: activeCertificate.status,
          purpose: activeCertificate.purpose,
          validFrom: activeCertificate.validFrom,
          expiresAt: activeCertificate.expiresAt,
          version: activeCertificate.version,
        }
  return {
    ...(safeCertificate === undefined ? {} : { activeCertificate: safeCertificate }),
    canIssueInProduction: false,
    environment: settings.cte.environment,
    status: 'success',
  }
}
