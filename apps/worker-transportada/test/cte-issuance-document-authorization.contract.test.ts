/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCteIssuanceWorkerEffect } from '../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import { CteIssuanceFatalError } from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import type { CteIssuanceExecutionInput } from '../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import { CTE_BATCH_DOCUMENT_NOT_AUTHORIZED } from '../src/cte-issuance/domain/cte-batch-block-reason.constant.js'
import {
  FISCAL_NUMBER_BURNED_CAUSE,
  mayHaveReachedSefaz,
} from '../src/cte-issuance/domain/cte-retransmission.policy.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'

const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
const ATTEMPT_ID = '7c0f1c2e-6a3b-4f0d-8a52-4b6e5d3c2b10'
const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'
const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'
const RETRANSMISSION_LOG = 'cte_issuance_document_check_skipped_retransmission'

const ISSUE_ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: 'd1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  companyId: COMPANY_ID,
  correlationId: 'cte-document-authorization-contract',
  eventId: 'f1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8',
  occurredAt: '2026-09-15T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-authorization',
    attemptId: ATTEMPT_ID,
    attemptKind: 'issue',
    batchId: BATCH_ID,
    batchItemId: BATCH_ITEM_ID,
    status: 'requested',
  },
  type: 'transportada.cte.item.issue.requested',
  version: 1,
}

const EXECUTION_INPUT: CteIssuanceExecutionInput = {
  config: {
    bairro: 'Centro',
    cep: '09010000',
    certificadoBase64: 'BASE64CERT',
    certificadoSenha: 'senha-do-certificado',
    cnpj: '12345678000190',
    codigoMunicipio: '3526902',
    crt: '3',
    environment: 'production',
    inscricaoEstadual: '111222333444',
    logradouro: 'Rua das Transportadoras',
    municipio: 'Jundiai',
    numero: '250',
    numeroCte: 100000001,
    razaoSocial: 'Transportadora Exemplo LTDA',
    rntrc: '12345678',
    serie: '7',
    uf: 'SP',
  },
  cteData: { valorTotalPrestacao: 100, valorTotalReceber: 120 },
  documentId: BATCH_ITEM_ID,
  tenantId: COMPANY_ID,
}

function createFixture(input: {
  readonly isAuthorized: boolean
  readonly mayHaveReachedSefaz: boolean
}) {
  const calls: string[] = []
  const checkedKeys: Array<Record<string, string>> = []
  const infoMessages: string[] = []
  const rejectedCalls: Array<{ readonly errorCode: string }> = []

  const effect = createCteIssuanceWorkerEffect({
    createProvider: () => ({
      cancel: async () => {
        throw new Error('cancel must never run on an issue envelope')
      },
      emit: async () => {
        calls.push('emit')
        return {
          chaveAcesso: '35260712345678000190570070000000011000000019',
          protocolo: '135260000123456',
          rawResponse: {},
          success: true,
          xmlAutorizado: '<cte/>',
        }
      },
      testConnection: async () => ({ ok: true, message: 'ok', rawResponse: {} }),
    }),
    documentAuthorizationCheck: {
      isAuthorized: async (params) => {
        calls.push('isAuthorized')
        checkedKeys.push({ ...params })
        return input.isAuthorized
      },
      mayHaveReachedSefaz: async (params) => {
        calls.push('mayHaveReachedSefaz')
        checkedKeys.push({ ...params })
        return input.mayHaveReachedSefaz
      },
    },
    logger: {
      error: () => {},
      info: (message: string) => {
        infoMessages.push(message)
      },
      warn: () => {},
    },
    resolveExecutionInput: async () => EXECUTION_INPUT,
    writeBack: {
      recordAuthorized: async () => {
        calls.push('recordAuthorized')
      },
      recordCancellationRejected: async () => {},
      recordCancelled: async () => {},
      recordInFlight: async () => {
        calls.push('recordInFlight')
      },
      recordRejected: async ({ errorCode }) => {
        calls.push('recordRejected')
        rejectedCalls.push({ errorCode })
      },
      recordRetryScheduled: async () => {},
    },
  })

  return { calls, checkedKeys, effect, infoMessages, rejectedCalls }
}

describe('CT-e issuance document authorization contract (spec 149 T4)', () => {
  test('first transmission of an item with a non-authorized note fails without reaching the fiscal gateway', async () => {
    const fixture = createFixture({ isAuthorized: false, mayHaveReachedSefaz: false })

    await expect(fixture.effect.execute({ envelope: ISSUE_ENVELOPE })).rejects.toBeInstanceOf(
      CteIssuanceFatalError,
    )

    // A checagem vem antes do in_flight: só assim in_flight quer dizer "o gateway pode ter sido chamado"
    expect(fixture.calls).toEqual(['mayHaveReachedSefaz', 'isAuthorized', 'recordRejected'])
    expect(fixture.checkedKeys).toEqual([
      { attemptId: ATTEMPT_ID, companyId: COMPANY_ID },
      { batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID },
    ])
    expect(fixture.rejectedCalls).toEqual([{ errorCode: CTE_BATCH_DOCUMENT_NOT_AUTHORIZED }])
  })

  test('first transmission of an item whose notes are all authorized reaches the gateway', async () => {
    const fixture = createFixture({ isAuthorized: true, mayHaveReachedSefaz: false })

    await fixture.effect.execute({ envelope: ISSUE_ENVELOPE })

    expect(fixture.calls).toEqual([
      'mayHaveReachedSefaz',
      'isAuthorized',
      'recordInFlight',
      'emit',
      'recordAuthorized',
    ])
    expect(fixture.rejectedCalls).toEqual([])
  })

  test('a retransmission that may already be at SEFAZ skips the check and lets the gateway reconcile', async () => {
    const fixture = createFixture({ isAuthorized: false, mayHaveReachedSefaz: true })

    await fixture.effect.execute({ envelope: ISSUE_ENVELOPE })

    expect(fixture.calls).toEqual([
      'mayHaveReachedSefaz',
      'recordInFlight',
      'emit',
      'recordAuthorized',
    ])
    expect(fixture.rejectedCalls).toEqual([])
    expect(fixture.infoMessages).toContain(RETRANSMISSION_LOG)
  })
})

describe('mayHaveReachedSefaz — o que a tentativa já viveu (spec 149, revisão final)', () => {
  test('attempt never transmitted (pending) — the check runs', () => {
    expect(mayHaveReachedSefaz({ lastErrorCause: null, status: 'pending' })).toBe(false)
  })

  test('attempt not found — the check runs, and fails closed on its own', () => {
    expect(mayHaveReachedSefaz(null)).toBe(false)
  })

  test('redelivered while in_flight — the transmission may be at SEFAZ', () => {
    expect(mayHaveReachedSefaz({ lastErrorCause: null, status: 'in_flight' })).toBe(true)
  })

  test('retry after a provider error or timeout with the same number — may be at SEFAZ', () => {
    expect(mayHaveReachedSefaz({ lastErrorCause: 'ETIMEDOUT', status: 'retry_scheduled' })).toBe(
      true,
    )
    expect(mayHaveReachedSefaz({ lastErrorCause: null, status: 'retry_scheduled' })).toBe(true)
  })

  test('retry after the number was burned — the new number was never transmitted', () => {
    expect(
      mayHaveReachedSefaz({
        lastErrorCause: `${FISCAL_NUMBER_BURNED_CAUSE}:539`,
        status: 'retry_scheduled',
      }),
    ).toBe(false)
  })
})
