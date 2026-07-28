/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export type CompanySettings = {
  readonly cte: {
    readonly environment: 'homologation' | 'production'
    readonly nextNumber: bigint
    readonly series: bigint
  }
  readonly cteRetry: {
    readonly backoffSeconds: readonly number[]
    readonly maxAttempts: number
  }
  readonly expectedVersion: bigint | null
  readonly mdfe: {
    readonly bankBranch: string
    readonly bankCode: string
    readonly insurancePolicy: string
    readonly insuranceResponsibility: '' | '1' | '2'
    readonly insurerName: string
    readonly insurerTaxId: string
    readonly pixKey: string
  }
  readonly profile: {
    readonly city: string
    readonly cityIbgeCode: string
    readonly cnpj: string
    readonly complement: string
    readonly district: string
    readonly email: string
    readonly legalName: string
    readonly municipalRegistration: string
    readonly number: string
    readonly phone: string
    readonly postalCode: string
    readonly rntrc: string
    readonly state: string
    readonly stateRegistration: string
    readonly street: string
    readonly taxRegime: '1' | '2' | '3'
    readonly tradeName: string
  }
}

export type UpdateCompanySettingsInput = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly settings: CompanySettings
}

export const COMPANY_ID = '00000000-0000-4000-8000-000000000101'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000102'
export const USER_ID = '00000000-0000-4000-8000-000000000103'
export const CORRELATION_ID = '00000000-0000-4000-8000-000000000104'
export const IDEMPOTENCY_KEY = 'settings-update-0001'
export const SECRET_SENTINEL = 'secret-material-must-not-be-persisted'

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000000105',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

const CTE_RETRY_POLICY: CompanySettings['cteRetry'] = {
  backoffSeconds: [10, 60, 900],
  maxAttempts: 5,
}

export const COMPANY_SETTINGS = {
  cte: {
    environment: 'homologation',
    nextNumber: 13_809n,
    series: 1n,
  },
  cteRetry: CTE_RETRY_POLICY,
  expectedVersion: null,
  mdfe: {
    bankBranch: '1234',
    bankCode: '341',
    insurancePolicy: '1234567890',
    insuranceResponsibility: '1',
    insurerName: 'Seguradora Contract',
    insurerTaxId: '11222333000181',
    pixKey: '',
  },
  profile: {
    city: 'Ribeirao Preto',
    cityIbgeCode: '3543402',
    cnpj: '61156864000191',
    complement: '',
    district: 'Independencia',
    email: 'fiscal@example.test',
    legalName: 'Transportadora Contract Test Ltda',
    municipalRegistration: '',
    number: '2296',
    phone: '1600000000',
    postalCode: '14076400',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '154336693112',
    street: 'Rua Contract',
    taxRegime: '1',
    tradeName: 'Transportadora Contract',
  },
} as const satisfies CompanySettings

export const UPDATE_COMPANY_SETTINGS_INPUT = {
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  settings: COMPANY_SETTINGS,
} as const satisfies UpdateCompanySettingsInput

export const EXPECTED_SETTINGS_RESULT = {
  cte: {
    environment: 'homologation',
    nextNumber: 13_809n,
    series: 1n,
    version: 1n,
  },
  cteRetry: CTE_RETRY_POLICY,
  mdfe: COMPANY_SETTINGS.mdfe,
  profile: {
    ...COMPANY_SETTINGS.profile,
    version: 1n,
  },
} as const

export const EXPECTED_FINGERPRINT_FIELDS = [
  COMPANY_ID,
  '',
  COMPANY_SETTINGS.profile.legalName,
  COMPANY_SETTINGS.profile.tradeName,
  COMPANY_SETTINGS.profile.cnpj,
  COMPANY_SETTINGS.profile.stateRegistration,
  COMPANY_SETTINGS.profile.municipalRegistration,
  COMPANY_SETTINGS.profile.taxRegime,
  COMPANY_SETTINGS.profile.rntrc,
  COMPANY_SETTINGS.profile.street,
  COMPANY_SETTINGS.profile.number,
  COMPANY_SETTINGS.profile.complement,
  COMPANY_SETTINGS.profile.district,
  COMPANY_SETTINGS.profile.city,
  COMPANY_SETTINGS.profile.state,
  COMPANY_SETTINGS.profile.postalCode,
  COMPANY_SETTINGS.profile.cityIbgeCode,
  COMPANY_SETTINGS.profile.phone,
  COMPANY_SETTINGS.profile.email,
  COMPANY_SETTINGS.cte.environment,
  COMPANY_SETTINGS.cte.series.toString(),
  COMPANY_SETTINGS.cte.nextNumber.toString(),
  COMPANY_SETTINGS.cteRetry.maxAttempts.toString(),
  COMPANY_SETTINGS.cteRetry.backoffSeconds.join(','),
  COMPANY_SETTINGS.mdfe.insuranceResponsibility,
  COMPANY_SETTINGS.mdfe.insurerName,
  COMPANY_SETTINGS.mdfe.insurerTaxId,
  COMPANY_SETTINGS.mdfe.insurancePolicy,
  COMPANY_SETTINGS.mdfe.bankCode,
  COMPANY_SETTINGS.mdfe.bankBranch,
  COMPANY_SETTINGS.mdfe.pixKey,
] as const
