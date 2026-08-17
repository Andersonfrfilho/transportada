/* Copyright (c) 2026 Ada Technology. MIT License. */
export const SETTINGS_MANAGE = 'settings.manage'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR =
  'WyIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCIwMThmNmE0NS0yZDlkLTdlNjAtYmI0Mi01YjFhNGM0ZDNlOTEiXQ'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'frontend-contract-key-0001'

export type CompanySettingsUpdateContract = Readonly<{
  billing: Readonly<{
    bankAccount: string
    bankBranch: string
    bankCode: string
    bankName: string
    observations: string
    pixKey: string
  }>
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

export const SAFE_CERTIFICATE = {
  expiresAt: '2030-01-01T00:00:00.000Z',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
  purpose: 'cte',
  status: 'active',
  validFrom: '2026-01-01T00:00:00.000Z',
  version: '1',
} as const

export const SAFE_MDFE_CERTIFICATE = {
  expiresAt: '2030-01-01T00:00:00.000Z',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e92',
  purpose: 'mdfe',
  status: 'active',
  validFrom: '2026-01-01T00:00:00.000Z',
  version: '3',
} as const

export type DigitalCertificatesResponseContract = Readonly<{
  data: readonly Readonly<{
    expiresAt: string
    id: string
    purpose: 'cte' | 'mdfe'
    status: 'active' | 'retired'
    validFrom: string
    version: string
  }>[]
  page: Readonly<{ nextCursor: string | null }>
}>

export const BILLING_DEFAULTS = {
  bankAccount: '12345-6',
  bankBranch: '1234',
  bankCode: '341',
  bankName: 'Banco Sintético',
  observations: 'Pagamento somente em conta da empresa.',
  pixKey: '',
} as const

export const COMPANY_SETTINGS_RESPONSE = {
  data: {
    activation: { channel: 'email' },
    billing: BILLING_DEFAULTS,
    cte: {
      environment: 'production',
      nextNumber: '9007199254740991',
      series: '1',
      version: '2',
    },
    cteRetry: {
      backoffSeconds: [10, 60, 900],
      maxAttempts: 5,
    },
    mdfe: {
      bankBranch: '1234',
      bankCode: '341',
      insurancePolicy: '1234567890',
      insuranceResponsibility: '1',
      insurerName: 'Seguradora Sintética',
      insurerTaxId: '11222333000181',
      pixKey: '',
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
  billing: BILLING_DEFAULTS,
  cte: {
    environment: 'production',
    nextNumber: '9007199254740991',
    series: '1',
  },
  cteRetry: {
    backoffSeconds: [10, 60, 900],
    maxAttempts: 5,
  },
  expectedVersion: '2',
  mdfe: {
    bankBranch: '1234',
    bankCode: '341',
    insurancePolicy: '1234567890',
    insuranceResponsibility: '1',
    insurerName: 'Seguradora Sintética',
    insurerTaxId: '11222333000181',
    pixKey: '',
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
  },
} as const satisfies CompanySettingsUpdateContract

export const DIGITAL_CERTIFICATES_RESPONSE = {
  data: [SAFE_CERTIFICATE],
  page: { nextCursor: null },
} as const satisfies DigitalCertificatesResponseContract

export const DUAL_PURPOSE_CERTIFICATES_RESPONSE = {
  data: [
    { ...SAFE_CERTIFICATE, id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93', status: 'retired' },
    SAFE_MDFE_CERTIFICATE,
    SAFE_CERTIFICATE,
  ],
  page: { nextCursor: null },
} as const satisfies DigitalCertificatesResponseContract

export type FuelPriceEntryContract = Readonly<{
  effectivePricePerUnit: string | null
  product: string
  reference: Readonly<{ pricePerUnit: string; state: string; weekEndingOn: string }> | null
  source: 'anp' | 'manual' | null
  unit: 'cubic-metre' | 'litre'
  updatedAt: string | null
}>

/**
 * A API devolve os cinco produtos do catálogo mesmo sem preço — é o que permite a tela desenhar a
 * linha faltante em vez de adivinhar quais sumiram.
 */
export const FUEL_PRICE_ENTRIES = [
  {
    effectivePricePerUnit: '6.2400',
    product: 'diesel-s10',
    reference: { pricePerUnit: '6.2400', state: 'SP', weekEndingOn: '2026-07-25' },
    source: 'anp',
    unit: 'litre',
    updatedAt: '2026-07-26T03:00:00.000Z',
  },
  {
    effectivePricePerUnit: '5.8900',
    product: 'diesel-s500',
    reference: { pricePerUnit: '6.0100', state: 'SP', weekEndingOn: '2026-07-25' },
    source: 'manual',
    unit: 'litre',
    updatedAt: '2026-07-28T12:00:00.000Z',
  },
  {
    effectivePricePerUnit: '6.4900',
    product: 'gasolina-comum',
    reference: { pricePerUnit: '6.4900', state: 'SP', weekEndingOn: '2026-07-25' },
    source: 'anp',
    unit: 'litre',
    updatedAt: '2026-07-26T03:00:00.000Z',
  },
  {
    effectivePricePerUnit: '4.1500',
    product: 'etanol-hidratado',
    reference: { pricePerUnit: '4.1500', state: 'SP', weekEndingOn: '2026-07-25' },
    source: 'anp',
    unit: 'litre',
    updatedAt: '2026-07-26T03:00:00.000Z',
  },
  {
    effectivePricePerUnit: null,
    product: 'gnv',
    reference: null,
    source: null,
    unit: 'cubic-metre',
    updatedAt: null,
  },
] as const satisfies readonly FuelPriceEntryContract[]

export const ADJUSTED_FUEL_PRICE = {
  effectivePricePerUnit: '4.9900',
  product: 'gnv',
  reference: null,
  source: 'manual',
  unit: 'cubic-metre',
  updatedAt: '2026-08-14T09:00:00.000Z',
} as const satisfies FuelPriceEntryContract

export const EMPTY_COMPANY_SETTINGS_RESPONSE = {
  data: { activation: null, billing: null, cte: null, cteRetry: null, mdfe: null, profile: null },
} as const

export function syntheticCertificateFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'synthetic-certificate.pfx', {
    type: 'application/x-pkcs12',
  })
}

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
