/* Copyright (c) 2026 Ada Technology. MIT License. */
export type CompanySettingsUpdate = Readonly<{
  cte: Readonly<{
    environment: 'homologation' | 'production'
    nextNumber: string
    series: string
  }>
  expectedVersion: string | null
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
    activeCertificate: SafeCertificate | null
    cte: (CompanySettingsUpdate['cte'] & Readonly<{ version: string }>) | null
    profile: (CompanySettingsUpdate['profile'] & Readonly<{ version: string }>) | null
  }>
}>

export type DigitalCertificatesResponse = Readonly<{
  data: readonly SafeCertificate[]
  page: Readonly<{ nextCursor: string | null }>
}>
