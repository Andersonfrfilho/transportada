/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Sem zod nesta app: guarda manual, formatada e testada isolada (`*.validation.ts`). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export type ContractorContactDraft = Readonly<{
  canDecide: boolean
  email: string
  receivesOccurrences: boolean
}>

export const CONTRACTOR_CONTACT_VALIDATION_ERROR = {
  EMAIL_REQUIRED: 'emailRequired',
  EMAIL_INVALID: 'emailInvalid',
} as const

export type ContractorContactValidationError =
  (typeof CONTRACTOR_CONTACT_VALIDATION_ERROR)[keyof typeof CONTRACTOR_CONTACT_VALIDATION_ERROR]

/** `trim` + minúsculas antes de validar: o servidor normaliza igual (spec 150 T301), a tela adianta. */
export function normalizeContractorContactEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateContractorContactEmail(
  email: string,
): ContractorContactValidationError | undefined {
  const normalized = normalizeContractorContactEmail(email)
  if (normalized.length === 0) return CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED
  if (!EMAIL_PATTERN.test(normalized)) return CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_INVALID
  return undefined
}

export function buildContractorContactSubmission(
  draft: ContractorContactDraft,
): Readonly<{ canDecide: boolean; email: string; receivesOccurrences: boolean }> | undefined {
  if (validateContractorContactEmail(draft.email) !== undefined) return undefined
  return {
    canDecide: draft.canDecide,
    email: normalizeContractorContactEmail(draft.email),
    receivesOccurrences: draft.receivesOccurrences,
  }
}
