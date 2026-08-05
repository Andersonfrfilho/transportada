/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Diagnóstico de elegibilidade da distribuição agendada de NF-e. Espelha, com o
 * mesmo vocabulário fechado de razões, a policy homônima do cron — as duas apps
 * não compartilham código-fonte, e cada lado tem o seu contract test sobre esta
 * tabela. A primeira razão encontrada é a reportada: é a que o operador precisa
 * resolver antes das seguintes.
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

export type DistributionCertificateFacts = {
  readonly expiresAt: Date
  readonly status: 'active' | 'retired'
  readonly validFrom: Date
}

export type DistributionEligibilityFacts = {
  readonly certificate: DistributionCertificateFacts | undefined
  readonly companyStatus: 'active' | 'disabled'
  readonly hasSyntheticMembership: boolean
  readonly nextAllowedAt: Date | undefined
  readonly scheduledDistributionEnabled: boolean
}

export type DistributionEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: DistributionIneligibilityReason }

type EvaluateDistributionEligibilityParams = {
  readonly facts: DistributionEligibilityFacts
  readonly now: Date
}

const ELIGIBLE: DistributionEligibility = { eligible: true }

export function evaluateDistributionEligibility({
  facts,
  now,
}: EvaluateDistributionEligibilityParams): DistributionEligibility {
  const reason = findBlockingReason(facts, now)
  return reason === undefined ? ELIGIBLE : { eligible: false, reason }
}

function findBlockingReason(
  facts: DistributionEligibilityFacts,
  now: Date,
): DistributionIneligibilityReason | undefined {
  if (facts.companyStatus !== 'active') return 'company_disabled'
  if (!facts.scheduledDistributionEnabled) return 'not_opted_in'
  if (!facts.hasSyntheticMembership) return 'missing_synthetic_membership'

  const certificateReason = findCertificateReason(facts.certificate, now)
  if (certificateReason !== undefined) return certificateReason

  const nextAllowedAt = facts.nextAllowedAt
  if (nextAllowedAt !== undefined && nextAllowedAt.getTime() > now.getTime()) {
    return 'cooldown_active'
  }
  return undefined
}

function findCertificateReason(
  certificate: DistributionCertificateFacts | undefined,
  now: Date,
): DistributionIneligibilityReason | undefined {
  if (certificate === undefined || certificate.status !== 'active') return 'certificate_missing'
  if (certificate.validFrom.getTime() > now.getTime()) return 'certificate_not_yet_valid'
  if (certificate.expiresAt.getTime() <= now.getTime()) return 'certificate_expired'
  return undefined
}
