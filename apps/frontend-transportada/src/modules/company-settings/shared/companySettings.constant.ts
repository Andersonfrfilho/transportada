/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CTE_RETRY_DEFAULT_MAX_ATTEMPTS = 3
export const CTE_RETRY_DEFAULT_BACKOFF_SECONDS: readonly number[] = [5, 30, 300]
export const CTE_RETRY_MAX_ATTEMPTS_LIMIT = 10
export const CTE_RETRY_BACKOFF_STEPS_LIMIT = 10
export const MDFE_INSURER_TAX_ID_LENGTHS: readonly number[] = [11, 14]
export const MDFE_BANK_CODE_LENGTH = 3
export const EMPTY_MDFE_DEFAULTS = {
  bankBranch: '',
  bankCode: '',
  insurancePolicy: '',
  insuranceResponsibility: '',
  insurerName: '',
  insurerTaxId: '',
  pixKey: '',
} as const
