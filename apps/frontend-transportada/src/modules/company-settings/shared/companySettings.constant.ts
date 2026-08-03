/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CertificatePurpose } from './companySettings.types'

export const CERTIFICATE_PURPOSE_LABEL_KEYS = {
  cte: 'certificatePurposeCte',
  mdfe: 'certificatePurposeMdfe',
} as const satisfies Record<CertificatePurpose, string>

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
