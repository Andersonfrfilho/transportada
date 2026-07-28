/* Copyright (c) 2026 Ada Technology. MIT License. */
export type CompanySettingsUpdate = Readonly<{
  cte: Readonly<{
    environment: 'homologation' | 'production'
    nextNumber: string
    series: string
  }>
  cteRetry: Readonly<{
    backoffSeconds: readonly number[]
    maxAttempts: number
  }>
  expectedVersion: string | null
  mdfe: Readonly<{
    bankBranch: string
    bankCode: string
    insurancePolicy: string
    insuranceResponsibility: '' | '1' | '2'
    insurerName: string
    insurerTaxId: string
    pixKey: string
  }>
  profile: Readonly<{
    city: string
    cityIbgeCode: string
    cnpj: string
    complement: string
    district: string
    email: string
    legalName: string
    municipalRegistration: string
    number: string
    phone: string
    postalCode: string
    rntrc: string
    state: string
    stateRegistration: string
    street: string
    taxRegime: '1' | '2' | '3'
    tradeName: string
  }>
}>

export type SafeCertificate = Readonly<{
  expiresAt: string
  id: string
  purpose: 'cte'
  status: 'active' | 'retired'
  validFrom: string
  version: string
}>

export type CompanySettingsResponse = Readonly<{
  data: Readonly<{
    cte: (CompanySettingsUpdate['cte'] & Readonly<{ version: string }>) | null
    cteRetry: CompanySettingsUpdate['cteRetry'] | null
    mdfe: CompanySettingsUpdate['mdfe'] | null
    profile: (CompanySettingsUpdate['profile'] & Readonly<{ version: string }>) | null
  }>
}>

export type CompanyProfileLookup = Readonly<{
  city: string
  cityIbgeCode: string
  cnpj: string
  complement: string
  district: string
  email: string
  legalName: string
  number: string
  phone: string
  postalCode: string
  state: string
  stateRegistration: string
  street: string
  tradeName: string
}>

export type CompanyProfileLookupResponse = Readonly<{
  data: CompanyProfileLookup | null
}>

export type DigitalCertificatesResponse = Readonly<{
  data: readonly SafeCertificate[]
  page: Readonly<{ nextCursor: string | null }>
}>
