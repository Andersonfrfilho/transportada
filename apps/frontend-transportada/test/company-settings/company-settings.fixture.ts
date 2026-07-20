/* Copyright (c) 2026 Ada Technology. MIT License. */
export const SETTINGS_MANAGE = 'settings.manage'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR =
  'WyIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCIwMThmNmE0NS0yZDlkLTdlNjAtYmI0Mi01YjFhNGM0ZDNlOTEiXQ'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'frontend-contract-key-0001'

export type CompanySettingsUpdateContract = Readonly<{
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

export const SAFE_CERTIFICATE = {
  expiresAt: '2030-01-01T00:00:00.000Z',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
  purpose: 'cte',
  status: 'active',
  validFrom: '2026-01-01T00:00:00.000Z',
  version: '1',
} as const

export type DigitalCertificatesResponseContract = Readonly<{
  data: readonly Readonly<{
    expiresAt: string
    id: string
    purpose: 'cte'
    status: 'active' | 'retired'
    validFrom: string
    version: string
  }>[]
  page: Readonly<{ nextCursor: string | null }>
}>

export const COMPANY_SETTINGS_RESPONSE = {
  data: {
    activeCertificate: null,
    cte: {
      environment: 'production',
      nextNumber: '9007199254740991',
      series: '1',
      version: '2',
    },
    profile: {
      city: 'Ribeirao Preto',
      cityIbgeCode: '3543402',
      cnpj: '12345678000199',
      complement: '',
      district: 'Independencia',
      email: 'fiscal@example.test',
      legalName: 'Transportadora Sintética LTDA',
      municipalRegistration: '',
      number: '2296',
      phone: '1600000000',
      postalCode: '14076400',
      rntrc: '58151044',
      state: 'SP',
      stateRegistration: '154336693112',
      street: 'Rua Sintética',
      taxRegime: '1',
      tradeName: 'Transportadora Sintética',
      version: '2',
    },
  },
} as const

export const COMPANY_SETTINGS_UPDATE = {
  cte: {
    environment: 'production',
    nextNumber: '9007199254740991',
    series: '1',
  },
  expectedVersion: '2',
  profile: {
    city: 'Ribeirao Preto',
    cityIbgeCode: '3543402',
    cnpj: '12345678000199',
    complement: '',
    district: 'Independencia',
    email: 'fiscal@example.test',
    legalName: 'Transportadora Sintética LTDA',
    municipalRegistration: '',
    number: '2296',
    phone: '1600000000',
    postalCode: '14076400',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '154336693112',
    street: 'Rua Sintética',
    taxRegime: '1',
    tradeName: 'Transportadora Sintética',
  },
} as const satisfies CompanySettingsUpdateContract

export const DIGITAL_CERTIFICATES_RESPONSE = {
  data: [SAFE_CERTIFICATE],
  page: { nextCursor: null },
} as const satisfies DigitalCertificatesResponseContract

export const EMPTY_COMPANY_SETTINGS_RESPONSE = {
  data: { activeCertificate: null, cte: null, profile: null },
} as const

export function syntheticCertificateFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'synthetic-certificate.pfx', {
    type: 'application/x-pkcs12',
  })
}

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
