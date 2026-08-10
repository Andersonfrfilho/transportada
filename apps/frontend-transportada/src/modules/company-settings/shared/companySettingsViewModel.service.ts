/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CERTIFICATE_PURPOSES } from './companySettings.types'
import type {
  CertificatePurpose,
  CompanySettingsResponse,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettingsClient.service'

export type ActiveCertificatesByPurpose = Readonly<
  Partial<Record<CertificatePurpose, SafeCertificate>>
>

export type CompanySettingsViewModel = Readonly<{
  activeCertificates: ActiveCertificatesByPurpose
  canIssueInProduction?: false
  environment?: 'homologation' | 'production'
  /** O certificado é validado contra o CNPJ do cadastro fiscal; sem cadastro a rota nem olha a senha. */
  hasFiscalProfileSaved: boolean
  status: 'empty' | 'error' | 'loading' | 'success'
}>

type ViewModelInput = Readonly<{
  certificates?: DigitalCertificatesResponse
  data?: CompanySettingsResponse
  status: 'error' | 'loading' | 'success'
}>

export type CompanySettingsViewModelFactory = (input: ViewModelInput) => CompanySettingsViewModel

function toSafeView(certificate: SafeCertificate): SafeCertificate {
  return {
    id: certificate.id,
    status: certificate.status,
    purpose: certificate.purpose,
    validFrom: certificate.validFrom,
    expiresAt: certificate.expiresAt,
    version: certificate.version,
  }
}

function resolveActiveCertificates(
  certificates: DigitalCertificatesResponse | undefined,
): ActiveCertificatesByPurpose {
  const active = certificates?.data.filter(({ status }) => status === 'active') ?? []
  return Object.fromEntries(
    CERTIFICATE_PURPOSES.flatMap((purpose) => {
      const certificate = active.find((candidate) => candidate.purpose === purpose)
      return certificate === undefined ? [] : [[purpose, toSafeView(certificate)]]
    }),
  )
}

export const createCompanySettingsViewModel: CompanySettingsViewModelFactory = (input) => {
  if (input.status !== 'success')
    return { activeCertificates: {}, hasFiscalProfileSaved: false, status: input.status }
  const settings = input.data?.data
  if (settings?.profile === null || settings?.cte === null || settings === undefined)
    return {
      activeCertificates: {},
      // `status: 'empty'` também cobre `cte` ausente, e o certificado não depende do CT-e.
      hasFiscalProfileSaved: settings?.profile != null,
      status: 'empty',
    }
  return {
    activeCertificates: resolveActiveCertificates(input.certificates),
    canIssueInProduction: false,
    environment: settings.cte.environment,
    hasFiscalProfileSaved: true,
    status: 'success',
  }
}
