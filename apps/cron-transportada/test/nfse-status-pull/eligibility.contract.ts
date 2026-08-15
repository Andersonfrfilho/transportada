/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfseReconciliationCandidate } from '../../src/nfse-status-pull/application/select-due-invoices.port.js'
import {
  evaluateNfseReconciliationEligibility,
  NFSE_RECONCILIATION_INELIGIBILITY_REASONS,
  type NfseReconciliationIneligibilityReason,
} from '../../src/nfse-status-pull/domain/nfse-reconciliation-eligibility.policy.js'

const NOW = new Date('2026-08-12T12:00:00.000Z')
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const INVOICE_ID = '00000000-0000-4000-8000-0000000000f1'
const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000a1'
const CREDENTIAL_ID = '00000000-0000-4000-8000-0000000000e1'

function dueCandidate(
  overrides: Partial<NfseReconciliationCandidate> = {},
): NfseReconciliationCandidate {
  return {
    attemptId: ATTEMPT_ID,
    companyId: COMPANY_ID,
    credential: {
      credentialId: CREDENTIAL_ID,
      envelope: { sealed: true },
      fiscalEnvironment: 'homologation',
      status: 'active',
    },
    invoiceId: INVOICE_ID,
    nextStatusCheckAt: new Date(NOW.getTime() - 60_000),
    providerDocumentId: '900123456',
    status: 'pending_authorization',
    ...overrides,
  }
}

function without(
  candidate: NfseReconciliationCandidate,
  key: 'attemptId' | 'credential' | 'nextStatusCheckAt' | 'providerDocumentId',
): NfseReconciliationCandidate {
  const copy: Record<string, unknown> = { ...candidate }
  delete copy[key]
  return copy as unknown as NfseReconciliationCandidate
}

const INELIGIBLE_CASES: ReadonlyArray<
  readonly [NfseReconciliationIneligibilityReason, NfseReconciliationCandidate]
> = [
  ['not_pending', dueCandidate({ status: 'authorized' })],
  ['missing_provider_document', without(dueCandidate(), 'providerDocumentId')],
  ['missing_attempt', without(dueCandidate(), 'attemptId')],
  ['missing_credential', without(dueCandidate(), 'credential')],
  [
    'missing_credential',
    dueCandidate({
      credential: {
        credentialId: CREDENTIAL_ID,
        envelope: { sealed: true },
        fiscalEnvironment: 'homologation',
        status: 'inactive',
      },
    }),
  ],
  [
    'environment_mismatch',
    dueCandidate({
      credential: {
        credentialId: CREDENTIAL_ID,
        envelope: { sealed: true },
        fiscalEnvironment: 'production',
        status: 'active',
      },
    }),
  ],
  ['not_due', dueCandidate({ nextStatusCheckAt: new Date(NOW.getTime() + 60_000) })],
]

describe('NFS-e reconciliation eligibility', () => {
  test('accepts a pending invoice whose next check is due', () => {
    expect(
      evaluateNfseReconciliationEligibility({
        candidate: dueCandidate(),
        environment: 'homologation',
        now: NOW,
      }),
    ).toEqual({ eligible: true })
  })

  /** O cancelamento é confirmado pela prefeitura depois, igual à autorização (T016a). */
  test('accepts an invoice waiting for its cancellation to be confirmed', () => {
    expect(
      evaluateNfseReconciliationEligibility({
        candidate: dueCandidate({ status: 'cancellation_requested' }),
        environment: 'homologation',
        now: NOW,
      }),
    ).toEqual({ eligible: true })
  })

  /** Nota pendente sem agendamento não pode ficar presa: sem data, ela é devida agora. */
  test('accepts a pending invoice with no scheduled check', () => {
    expect(
      evaluateNfseReconciliationEligibility({
        candidate: without(dueCandidate(), 'nextStatusCheckAt'),
        environment: 'homologation',
        now: NOW,
      }),
    ).toEqual({ eligible: true })
  })

  test('accepts an invoice whose check falls exactly on the cycle instant', () => {
    expect(
      evaluateNfseReconciliationEligibility({
        candidate: dueCandidate({ nextStatusCheckAt: NOW }),
        environment: 'homologation',
        now: NOW,
      }),
    ).toEqual({ eligible: true })
  })

  test.each(INELIGIBLE_CASES)('reports %s', (reason, candidate) => {
    expect(
      evaluateNfseReconciliationEligibility({ candidate, environment: 'homologation', now: NOW }),
    ).toEqual({ eligible: false, reason })
  })

  /** A razão vai para log e para métrica: acrescentar uma é decisão, não efeito colateral. */
  test('exposes a closed reason vocabulary', () => {
    expect([...NFSE_RECONCILIATION_INELIGIBILITY_REASONS].sort()).toEqual([
      'environment_mismatch',
      'missing_attempt',
      'missing_credential',
      'missing_provider_document',
      'not_due',
      'not_pending',
    ])
  })

  test('reports the first blocking reason when several apply', () => {
    const candidate = without(
      dueCandidate({ nextStatusCheckAt: new Date(NOW.getTime() + 60_000), status: 'rejected' }),
      'providerDocumentId',
    )

    expect(
      evaluateNfseReconciliationEligibility({ candidate, environment: 'homologation', now: NOW }),
    ).toEqual({ eligible: false, reason: 'not_pending' })
  })
})
