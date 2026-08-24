/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Aplica a política de elegibilidade sobre o recorte de notas pendentes e conta cada recusa por
 * razão — a contagem vai para os `counters` da execução, que é como se enxerga uma nota travada.
 */
import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  evaluateNfseReconciliationEligibility,
  NFSE_RECONCILIATION_INELIGIBILITY_REASONS,
  type NfseReconciliationIneligibilityReason,
} from '../domain/nfse-reconciliation-eligibility.policy.js'
import type { NfseReconciliationSourceStatus } from '../domain/nfse-reconciliation-outcome.policy.js'
import type { NfseCredentialAccess } from './nfse-fiscal-status.port.js'
import type {
  NfseReconciliationCandidate,
  NfseReconciliationCandidateSourcePort,
} from './select-due-invoices.port.js'

export type DueNfseInvoice = {
  readonly attemptId: string
  readonly companyId: string
  readonly credential: NfseCredentialAccess
  readonly invoiceId: string
  readonly providerDocumentId: string
  readonly status: NfseReconciliationSourceStatus
}

export type NfseReconciliationIneligibleCounts = Record<
  NfseReconciliationIneligibilityReason,
  number
>

export type SelectDueInvoicesUseCase = {
  execute(input: {
    readonly environment: NfseFiscalEnvironment
    readonly limit: number
    readonly now: Date
  }): Promise<{
    readonly due: readonly DueNfseInvoice[]
    readonly ineligibleCounts: NfseReconciliationIneligibleCounts
  }>
}

export function createEmptyNfseIneligibleCounts(): NfseReconciliationIneligibleCounts {
  const counts = {} as Record<NfseReconciliationIneligibilityReason, number>
  for (const reason of NFSE_RECONCILIATION_INELIGIBILITY_REASONS) counts[reason] = 0
  return counts
}

export function createSelectDueInvoicesUseCase(dependencies: {
  readonly logger: WorkerLogger
  readonly source: NfseReconciliationCandidateSourcePort
}): SelectDueInvoicesUseCase {
  return {
    async execute(input) {
      const candidates = await dependencies.source.listCandidates({
        environment: input.environment,
        limit: input.limit,
      })

      const due: DueNfseInvoice[] = []
      const ineligibleCounts = createEmptyNfseIneligibleCounts()

      for (const candidate of candidates) {
        const eligibility = evaluateNfseReconciliationEligibility({
          candidate,
          environment: input.environment,
          now: input.now,
        })

        if (!eligibility.eligible) {
          ineligibleCounts[eligibility.reason] += 1
          dependencies.logger.info('nfse_status_pull_invoice_not_eligible', {
            companyId: candidate.companyId,
            invoiceId: candidate.invoiceId,
            reason: eligibility.reason,
          })
          continue
        }

        due.push(toDueInvoice(candidate))
      }

      return { due, ineligibleCounts }
    },
  }
}

/** A elegibilidade já provou que os campos existem; aqui só se estreita o tipo. */
function toDueInvoice(candidate: NfseReconciliationCandidate): DueNfseInvoice {
  const credential = candidate.credential as NonNullable<NfseReconciliationCandidate['credential']>
  return {
    attemptId: candidate.attemptId as string,
    companyId: candidate.companyId,
    credential: {
      companyId: candidate.companyId,
      credentialId: credential.credentialId,
      envelope: credential.envelope,
      fiscalEnvironment: credential.fiscalEnvironment,
      municipalRegistration: credential.municipalRegistration,
    },
    invoiceId: candidate.invoiceId,
    providerDocumentId: candidate.providerDocumentId as string,
    status: candidate.status as NfseReconciliationSourceStatus,
  }
}
