/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Vocabulário fechado de razões devolvido pela policy de elegibilidade da API.
 * Traduzir aqui, e não no componente, é o que garante que uma razão nova chegue
 * à tela como texto — e não como o identificador cru vindo do JSON.
 */
export const DISTRIBUTION_INELIGIBILITY_REASONS = [
  'company_disabled',
  'not_opted_in',
  'missing_synthetic_membership',
  'certificate_missing',
  'certificate_not_yet_valid',
  'certificate_expired',
  'cooldown_active',
] as const

export type DistributionIneligibilityReason = (typeof DISTRIBUTION_INELIGIBILITY_REASONS)[number]

export const SCHEDULED_DISTRIBUTION_REASON_LABEL_KEYS: Readonly<
  Record<DistributionIneligibilityReason, string>
> = {
  certificate_expired: 'scheduledDistributionReasonCertificateExpired',
  certificate_missing: 'scheduledDistributionReasonCertificateMissing',
  certificate_not_yet_valid: 'scheduledDistributionReasonCertificateNotYetValid',
  company_disabled: 'scheduledDistributionReasonCompanyDisabled',
  cooldown_active: 'scheduledDistributionReasonCooldownActive',
  missing_synthetic_membership: 'scheduledDistributionReasonMissingSyntheticMembership',
  not_opted_in: 'scheduledDistributionReasonNotOptedIn',
}

export const SCHEDULED_DISTRIBUTION_UNKNOWN_REASON_KEY = 'scheduledDistributionReasonUnknown'

export function resolveIneligibilityLabelKey(reason: string | null): string {
  if (reason === null) return SCHEDULED_DISTRIBUTION_UNKNOWN_REASON_KEY
  return (
    SCHEDULED_DISTRIBUTION_REASON_LABEL_KEYS[reason as DistributionIneligibilityReason] ??
    SCHEDULED_DISTRIBUTION_UNKNOWN_REASON_KEY
  )
}
