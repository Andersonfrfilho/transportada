/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfseServiceInvoiceStatus } from '../src/database/nfse-issuance-execution.schema.js'
import { NFSE_PROCESSING_EVENT_TYPE } from '../src/messaging/nfse-processing-envelope.schema.js'
import type { NfseProcessingEnvelopeV1 } from '../src/messaging/nfse-processing-envelope.schema.js'
import { createNfseIssuanceWorkerEffect } from '../src/nfse-issuance/application/nfse-issuance-consumer.effect.js'
import type {
  NfseIssuanceExecutionInput,
  NfseIssuanceWriteBack,
} from '../src/nfse-issuance/application/nfse-issuance-consumer.effect.js'
import {
  NfseIssuanceFatalError,
  NfseIssuanceRecoverableError,
} from '../src/nfse-issuance/application/nfse-issuance.error.js'
import {
  NFSE_WRITE_BACK_KIND,
  resolveNfseWriteBack,
} from '../src/nfse-issuance/domain/nfse-write-back.policy.js'
import type {
  NfseGatewayCancelOutcome,
  NfseGatewayIssueOutcome,
} from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'

const COMPANY_ID = '3b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const INVOICE_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const ATTEMPT_ID = '6b7c8d9e-0f1a-4b2c-8d3e-4f5a6b7c8d9e'
const EVENT_ID = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f'
const ACTOR_ID = '8d9e0f1a-2b3c-4d4e-8f5a-6b7c8d9e0f1a'
const CREDENTIAL_ID = '9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b'
const PROVIDER_DOCUMENT_ID = 'nota-rp-4711'
const CANCELLATION_MOTIVE = '2'

const NOW = new Date('2026-08-12T12:00:00.000Z')

const CREDENTIAL = {
  companyId: COMPANY_ID,
  credentialId: CREDENTIAL_ID,
  envelope: { sealed: true },
  fiscalEnvironment: 'homologation',
  municipalRegistration: '12345678',
} as const

const ISSUE_ENVELOPE: NfseProcessingEnvelopeV1 = {
  actorId: ACTOR_ID,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: EVENT_ID,
  occurredAt: '2026-08-12T11:59:00.000Z',
  payload: {
    attemptFingerprint: 'fingerprint-1',
    attemptId: ATTEMPT_ID,
    attemptKind: 'issue',
    invoiceId: INVOICE_ID,
    status: 'requested',
  },
  type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_ISSUE_REQUESTED,
  version: 1,
}

const CANCEL_ENVELOPE: NfseProcessingEnvelopeV1 = {
  ...ISSUE_ENVELOPE,
  payload: { ...ISSUE_ENVELOPE.payload, attemptKind: 'cancel', status: 'cancellation_requested' },
  type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_CANCEL_REQUESTED,
}

type WriteBackCall = { readonly method: string; readonly params: Record<string, unknown> }

type EffectFixture = {
  readonly cancelled: Record<string, unknown>[]
  readonly execute: (envelope: NfseProcessingEnvelopeV1) => Promise<void>
  readonly issued: Record<string, unknown>[]
  readonly writes: WriteBackCall[]
}

function createEffectFixture(options?: {
  readonly cancelOutcome?: NfseGatewayCancelOutcome
  readonly input?: NfseIssuanceExecutionInput | undefined
  readonly issueOutcome?: NfseGatewayIssueOutcome
}): EffectFixture {
  const cancelled: Record<string, unknown>[] = []
  const issued: Record<string, unknown>[] = []
  const writes: WriteBackCall[] = []

  const record =
    (method: string) =>
    async (params: Record<string, unknown>): Promise<void> => {
      writes.push({ method, params: { ...params } })
    }

  const writeBack: NfseIssuanceWriteBack = {
    recordAccepted: record('recordAccepted'),
    recordCancellationConfirmed: record('recordCancellationConfirmed'),
    recordInFlight: record('recordInFlight'),
    recordRejected: record('recordRejected'),
    recordRetryScheduled: record('recordRetryScheduled'),
  }

  const defaultInput: NfseIssuanceExecutionInput = {
    cancellationMotive: CANCELLATION_MOTIVE,
    credential: CREDENTIAL,
    payload: { serviceAmount: '100.0000' },
    providerDocumentId: PROVIDER_DOCUMENT_ID,
  }

  const effect = createNfseIssuanceWorkerEffect({
    clock: () => NOW,
    executionInput: {
      load: async () => (options && 'input' in options ? options.input : defaultInput),
    },
    gateway: {
      cancel: async (params) => {
        cancelled.push({ ...params })
        return options?.cancelOutcome ?? { status: 'accepted' }
      },
      issue: async (params) => {
        issued.push({ ...params })
        return (
          options?.issueOutcome ?? { providerDocumentId: PROVIDER_DOCUMENT_ID, status: 'accepted' }
        )
      },
    },
    writeBack,
  })

  return {
    cancelled,
    execute: async (envelope) => effect.execute({ envelope }),
    issued,
    writes,
  }
}

describe('NFS-e write-back status guard contract', () => {
  test('takes the invoice from the stored status, never from the envelope', () => {
    expect(
      resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.inFlight, storedStatus: 'requested' }),
    ).toEqual({ allowed: true, nextStatus: 'issuing' })
    expect(
      resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.accepted, storedStatus: 'issuing' }),
    ).toEqual({ allowed: true, nextStatus: 'pending_authorization' })
    expect(
      resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.rejected, storedStatus: 'issuing' }),
    ).toEqual({ allowed: true, nextStatus: 'rejected' })
  })

  test('only the invoice with a cancellation in flight becomes cancelled', () => {
    expect(
      resolveNfseWriteBack({
        kind: NFSE_WRITE_BACK_KIND.cancelled,
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ allowed: true, nextStatus: 'cancelled' })

    const refusedFrom: readonly NfseServiceInvoiceStatus[] = [
      'authorized',
      'cancelled',
      'failed',
      'issuing',
      'pending_authorization',
      'rejected',
      'requested',
    ]
    for (const storedStatus of refusedFrom) {
      expect(resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.cancelled, storedStatus })).toEqual({
        allowed: false,
      })
    }
  })

  test('the dead-letter only fails an invoice still mid-flight', () => {
    for (const storedStatus of ['issuing', 'requested'] as const) {
      expect(resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.failed, storedStatus })).toEqual({
        allowed: true,
        nextStatus: 'failed',
      })
    }

    const refusedFrom: readonly NfseServiceInvoiceStatus[] = [
      'authorized',
      'cancellation_requested',
      'cancelled',
      'failed',
      'pending_authorization',
      'rejected',
    ]
    for (const storedStatus of refusedFrom) {
      expect(resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.failed, storedStatus })).toEqual({
        allowed: false,
      })
    }
  })

  test('refuses an acceptance that arrives over an invoice already settled', () => {
    for (const storedStatus of ['authorized', 'cancelled', 'cancellation_requested'] as const) {
      expect(resolveNfseWriteBack({ kind: NFSE_WRITE_BACK_KIND.accepted, storedStatus })).toEqual({
        allowed: false,
      })
    }
  })
})

describe('NFS-e issuance effect contract', () => {
  test('marks the attempt in flight before touching the provider', async () => {
    const fixture = createEffectFixture()

    await fixture.execute(ISSUE_ENVELOPE)

    expect(fixture.writes.map((call) => call.method)).toEqual(['recordInFlight', 'recordAccepted'])
    expect(fixture.writes[1]?.params).toMatchObject({
      attemptId: ATTEMPT_ID,
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })
  })

  test('never passes the envelope status to the write-back — it is diagnostic only', async () => {
    const fixture = createEffectFixture()

    await fixture.execute(ISSUE_ENVELOPE)

    for (const call of fixture.writes) {
      expect(Object.keys(call.params)).not.toContain('status')
    }
  })

  test('a rejection from the prefeitura is fatal: no retry is worth spending', async () => {
    const fixture = createEffectFixture({
      issueOutcome: { rejection: { code: 'E123', message: 'CNAE inválido' }, status: 'rejected' },
    })

    await expect(fixture.execute(ISSUE_ENVELOPE)).rejects.toBeInstanceOf(NfseIssuanceFatalError)
    expect(fixture.writes.map((call) => call.method)).toEqual(['recordInFlight', 'recordRejected'])
    expect(fixture.writes[1]?.params).toMatchObject({ errorCode: 'E123' })
  })

  test('a transport failure is recoverable and schedules a retry', async () => {
    const fixture = createEffectFixture({
      issueOutcome: { cause: 'transport_failure', status: 'error' },
    })

    await expect(fixture.execute(ISSUE_ENVELOPE)).rejects.toBeInstanceOf(
      NfseIssuanceRecoverableError,
    )
    expect(fixture.writes.map((call) => call.method)).toEqual([
      'recordInFlight',
      'recordRetryScheduled',
    ])
    expect(fixture.writes[1]?.params).toMatchObject({ cause: 'transport_failure' })
  })

  test('skips an attempt the database no longer offers, without calling the provider', async () => {
    const fixture = createEffectFixture({ input: undefined })

    await fixture.execute(ISSUE_ENVELOPE)

    expect(fixture.issued).toEqual([])
    expect(fixture.writes).toEqual([])
  })

  /** O XML da emissão é o congelado na requisição: sem ele não há o que transmitir, e remontar aqui mudaria o documento. */
  test('an issue whose payload was never frozen is fatal, and the provider is never called', async () => {
    const fixture = createEffectFixture({
      input: { credential: CREDENTIAL, providerDocumentId: PROVIDER_DOCUMENT_ID },
    })

    await expect(fixture.execute(ISSUE_ENVELOPE)).rejects.toBeInstanceOf(NfseIssuanceFatalError)
    expect(fixture.issued).toEqual([])
    expect(fixture.writes).toEqual([])
  })

  test('a cancellation runs without a frozen payload — only the issue freezes one', async () => {
    const fixture = createEffectFixture({
      input: {
        cancellationMotive: CANCELLATION_MOTIVE,
        credential: CREDENTIAL,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
      },
    })

    await fixture.execute(CANCEL_ENVELOPE)

    expect(fixture.cancelled).toHaveLength(1)
    expect(fixture.writes.map((call) => call.method)).toEqual([
      'recordInFlight',
      'recordCancellationConfirmed',
    ])
  })

  /**
   * O que chega ao provedor é o código, lido da linha da nota na hora de transmitir. O envelope não
   * carrega nem o código nem o texto: payload de mensagem é referência (`security.md` §6).
   */
  test('reads the cancellation motive code from the invoice row at transmission time', async () => {
    const fixture = createEffectFixture()

    await fixture.execute(CANCEL_ENVELOPE)

    expect(fixture.cancelled).toEqual([
      {
        cancellationMotive: CANCELLATION_MOTIVE,
        credential: CREDENTIAL,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
      },
    ])
    expect(Object.keys(CANCEL_ENVELOPE.payload)).not.toContain('cancellationMotive')
    expect(Object.keys(CANCEL_ENVELOPE.payload)).not.toContain('cancellationReason')
  })

  test('confirms the cancellation when the provider accepts it', async () => {
    const fixture = createEffectFixture()

    await fixture.execute(CANCEL_ENVELOPE)

    expect(fixture.writes.map((call) => call.method)).toEqual([
      'recordInFlight',
      'recordCancellationConfirmed',
    ])
    expect(fixture.issued).toEqual([])
  })

  test('a cancellation without a provider document is fatal, and the provider is never called', async () => {
    const fixture = createEffectFixture({
      input: { cancellationMotive: CANCELLATION_MOTIVE, credential: CREDENTIAL, payload: {} },
    })

    await expect(fixture.execute(CANCEL_ENVELOPE)).rejects.toBeInstanceOf(NfseIssuanceFatalError)
    expect(fixture.cancelled).toEqual([])
  })

  /** Sem código não há pedido: transmitir vazio faz a prefeitura recusar o cancelamento. */
  test('a cancellation without a stored motive code is fatal — the prefeitura demands one', async () => {
    const fixture = createEffectFixture({
      input: {
        credential: CREDENTIAL,
        payload: {},
        providerDocumentId: PROVIDER_DOCUMENT_ID,
      },
    })

    await expect(fixture.execute(CANCEL_ENVELOPE)).rejects.toBeInstanceOf(NfseIssuanceFatalError)
    expect(fixture.cancelled).toEqual([])
  })

  /** A trilha de escrita vai para a linha da tentativa e para o log: só referência opaca entra nela. */
  test('never leaks the cancellation motive into the write-back trail', async () => {
    const fixture = createEffectFixture({
      cancelOutcome: { cause: 'transport_failure', status: 'error' },
    })

    await expect(fixture.execute(CANCEL_ENVELOPE)).rejects.toBeInstanceOf(
      NfseIssuanceRecoverableError,
    )
    expect(JSON.stringify(fixture.writes)).not.toContain('cancellationMotive')
    expect(JSON.stringify(fixture.writes)).not.toContain('cancellationReason')
  })
})
