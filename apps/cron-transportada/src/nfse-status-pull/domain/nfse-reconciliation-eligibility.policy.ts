/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Decide quais notas de serviço entram no ciclo de reconciliação. O tipo do candidato vem da porta
 * da aplicação — mesmo arranjo de `distribution-eligibility.policy.ts`, que é a regra irmã do outro
 * job deste cron.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import type { NfseReconciliationCandidate } from '../application/select-due-invoices.port.js'

export const NFSE_RECONCILIATION_INELIGIBILITY_REASONS = [
  'not_pending',
  'missing_provider_document',
  'missing_attempt',
  'missing_credential',
  'environment_mismatch',
  'not_due',
] as const

export type NfseReconciliationIneligibilityReason =
  (typeof NFSE_RECONCILIATION_INELIGIBILITY_REASONS)[number]

export type NfseReconciliationEligibility =
  | { readonly eligible: false; readonly reason: NfseReconciliationIneligibilityReason }
  | { readonly eligible: true }

const RECONCILABLE_STATUSES = ['cancellation_requested', 'pending_authorization'] as const

const ELIGIBLE: NfseReconciliationEligibility = { eligible: true }

export function evaluateNfseReconciliationEligibility(input: {
  readonly candidate: NfseReconciliationCandidate
  readonly environment: CronFiscalEnvironment
  readonly now: Date
}): NfseReconciliationEligibility {
  const reason = findBlockingReason(input)
  return reason === undefined ? ELIGIBLE : { eligible: false, reason }
}

function findBlockingReason(input: {
  readonly candidate: NfseReconciliationCandidate
  readonly environment: CronFiscalEnvironment
  readonly now: Date
}): NfseReconciliationIneligibilityReason | undefined {
  const { candidate } = input

  if (!isReconcilableStatus(candidate.status)) return 'not_pending'
  if (isBlank(candidate.providerDocumentId)) return 'missing_provider_document'
  if (isBlank(candidate.attemptId)) return 'missing_attempt'
  if (candidate.credential === undefined || candidate.credential.status !== 'active') {
    return 'missing_credential'
  }
  if (candidate.credential.fiscalEnvironment !== input.environment) return 'environment_mismatch'
  /** Sem agendamento a nota é devida agora — pendente nenhuma pode ficar presa fora do ciclo. */
  if (candidate.nextStatusCheckAt !== undefined && candidate.nextStatusCheckAt > input.now) {
    return 'not_due'
  }

  return undefined
}

function isReconcilableStatus(
  status: NfseReconciliationCandidate['status'],
): status is (typeof RECONCILABLE_STATUSES)[number] {
  return RECONCILABLE_STATUSES.some((reconcilable) => reconcilable === status)
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === ''
}
