/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CertificatePurpose, CompanySettingsUpdate } from './companySettings.types'
import type { PixKeyType } from './pixKeyType.service'

export const CERTIFICATE_PURPOSE_LABEL_KEYS = {
  cte: 'certificatePurposeCte',
  mdfe: 'certificatePurposeMdfe',
} as const satisfies Record<CertificatePurpose, string>

export const PIX_KEY_TYPE_LABEL_KEYS = {
  cpf: 'pixKeyTypeCpf',
  cnpj: 'pixKeyTypeCnpj',
  email: 'pixKeyTypeEmail',
  phone: 'pixKeyTypePhone',
  evp: 'pixKeyTypeEvp',
} as const satisfies Record<PixKeyType, string>

/** Campos de tamanho exato pela legislação — a API os valida com regex de comprimento fixo. */
export const PROFILE_DIGIT_LENGTHS = {
  cityIbgeCode: 7,
  cnpj: 14,
  postalCode: 8,
  rntrc: 8,
} as const

export const CTE_RETRY_DEFAULT_MAX_ATTEMPTS = 3
export const CTE_RETRY_DEFAULT_BACKOFF_SECONDS: readonly number[] = [5, 30, 300]
export const CTE_RETRY_MAX_ATTEMPTS_LIMIT = 10
export const CTE_RETRY_BACKOFF_STEPS_LIMIT = 10
export const MDFE_INSURER_TAX_ID_LENGTHS: readonly number[] = [11, 14]
export const MDFE_BANK_CODE_LENGTH = 3
export const BILLING_BANK_CODE_LENGTH = 3
export const BILLING_BANK_BRANCH_MAX_LENGTH = 10
export const BILLING_BANK_ACCOUNT_MAX_LENGTH = 20
export const BILLING_BANK_NAME_MAX_LENGTH = 60
export const BILLING_OBSERVATIONS_MAX_LENGTH = 500
export const EMPTY_BILLING_DEFAULTS = {
  bankAccount: '',
  bankBranch: '',
  bankCode: '',
  bankName: '',
  observations: '',
  pixKey: '',
} as const
export const EMPTY_MDFE_DEFAULTS = {
  bankBranch: '',
  bankCode: '',
  insurancePolicy: '',
  insuranceResponsibility: '',
  insurerName: '',
  insurerTaxId: '',
  pixKey: '',
} as const

export function createDefaultCompanySettings(): CompanySettingsUpdate {
  return {
    billing: { ...EMPTY_BILLING_DEFAULTS },
    cte: { environment: 'homologation', nextNumber: '1', series: '1' },
    cteRetry: {
      backoffSeconds: [...CTE_RETRY_DEFAULT_BACKOFF_SECONDS],
      maxAttempts: CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
    },
    expectedVersion: null,
    mdfe: { ...EMPTY_MDFE_DEFAULTS },
    profile: {
      city: '',
      cityIbgeCode: '',
      cnpj: '',
      complement: '',
      district: '',
      email: '',
      legalName: '',
      municipalRegistration: '',
      number: '',
      phone: '',
      postalCode: '',
      rntrc: '',
      state: '',
      stateRegistration: '',
      street: '',
      taxRegime: '3',
      tradeName: '',
    },
  }
}
