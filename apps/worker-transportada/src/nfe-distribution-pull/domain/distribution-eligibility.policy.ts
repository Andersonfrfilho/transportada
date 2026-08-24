/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `api-transportada/src/companies/domain/distribution-eligibility.policy.ts` e
 * do gêmeo que o cron mantém — três apps que não importam código umas das outras. Mudou a regra ou o
 * vocabulário de um lado? mude dos outros; `test/job-run/nfe-distribution-eligibility.contract.ts`
 * guarda a lista deste lado, e o `failureOutcomes` de `nfe.distribution.pull` no catálogo é ela
 * palavra por palavra.
 */
import type { CertificateStatus } from '../../database/cte-issuance-execution.schema.js'

/**
 * A ordem é significativa: **a primeira razão encontrada é a reportada**, e ela vai da causa que o
 * operador resolve (empresa desligada, opt-in fechado, certificado vencido) para a que passa sozinha.
 * `cooldown_active` é a última porque é o repouso normal da rotina — a janela da SEFAZ é de uma hora
 * e a batida é de cinco minutos, então onze de cada doze ciclos param aqui, e parar aqui não é
 * problema: é a proteção contra o `cStat 656` funcionando.
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

export type DistributionCandidateCertificate = {
  readonly status: CertificateStatus
  readonly validFrom: Date
  readonly expiresAt: Date
}

export type DistributionEligibilityCandidate = {
  readonly certificate: DistributionCandidateCertificate | undefined
  readonly companyStatus: 'active' | 'disabled'
  readonly hasSyntheticMembership: boolean
  readonly nextAllowedAt: Date | undefined
  readonly scheduledDistributionEnabled: boolean
}

export type DistributionEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: DistributionIneligibilityReason }

const ELIGIBLE: DistributionEligibility = { eligible: true }

type EvaluateDistributionEligibilityParams = {
  readonly candidate: DistributionEligibilityCandidate
  readonly now: Date
}

export function evaluateDistributionEligibility({
  candidate,
  now,
}: EvaluateDistributionEligibilityParams): DistributionEligibility {
  const reason = findBlockingReason(candidate, now)
  return reason === undefined ? ELIGIBLE : { eligible: false, reason }
}

function findBlockingReason(
  candidate: DistributionEligibilityCandidate,
  now: Date,
): DistributionIneligibilityReason | undefined {
  if (candidate.companyStatus !== 'active') return 'company_disabled'
  if (!candidate.scheduledDistributionEnabled) return 'not_opted_in'
  if (!candidate.hasSyntheticMembership) return 'missing_synthetic_membership'

  const certificateReason = findCertificateReason(candidate.certificate, now)
  if (certificateReason !== undefined) return certificateReason

  const nextAllowedAt = candidate.nextAllowedAt
  if (nextAllowedAt !== undefined && nextAllowedAt.getTime() > now.getTime())
    return 'cooldown_active'

  return undefined
}

function findCertificateReason(
  certificate: DistributionCandidateCertificate | undefined,
  now: Date,
): DistributionIneligibilityReason | undefined {
  if (certificate === undefined || certificate.status !== 'active') return 'certificate_missing'
  if (certificate.validFrom.getTime() > now.getTime()) return 'certificate_not_yet_valid'
  if (certificate.expiresAt.getTime() <= now.getTime()) return 'certificate_expired'
  return undefined
}
