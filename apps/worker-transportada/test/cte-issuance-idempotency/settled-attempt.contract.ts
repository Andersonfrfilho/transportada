/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCteIssuanceWorkerEffect } from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type { CteIssuanceExecutionInput } from '../../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import {
  CTE_ISSUANCE_ITEM_STATUSES,
  isSettledCteIssuanceStatus,
} from '../../src/cte-issuance/domain/cte-batch-progress.policy.js'
import type { CteFiscalProvider } from '../../src/cte-issuance/infrastructure/cte-fiscal-gateway.js'
import type { CteProcessingEnvelopeV1 } from '../../src/messaging/cte-processing-envelope.schema.js'

const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
const ATTEMPT_ID = '3fa2f0f4-0f2b-4f8c-9c2f-1e0f9a5b7d21'
const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'
const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: 'd1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  companyId: COMPANY_ID,
  correlationId: 'settled-attempt-contract',
  eventId: 'e7f8a9b0-1c2d-4e3f-9a5b-6c7d8e9f0a1b',
  occurredAt: '2026-07-27T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-settled',
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
  cteData: { valorTotalReceber: 480.5 },
  documentId: BATCH_ITEM_ID,
  tenantId: COMPANY_ID,
}

describe('CT-e issuance settled attempt policy', () => {
  test('treats every terminal status as settled', () => {
    const settled = CTE_ISSUANCE_ITEM_STATUSES.filter((status) =>
      isSettledCteIssuanceStatus(status),
    )

    expect(settled).toEqual([
      'authorized',
      'rejected',
      'failed',
      'reconciliation_required',
      'cancelled',
    ])
  })

  test('leaves statuses that still expect a transmission open', () => {
    expect(isSettledCteIssuanceStatus('pending')).toBeFalse()
    expect(isSettledCteIssuanceStatus('in_flight')).toBeFalse()
    expect(isSettledCteIssuanceStatus('retry_scheduled')).toBeFalse()
  })
})

describe('CT-e issuance redelivery of a settled attempt', () => {
  test('never reaches SEFAZ nor writes back when the attempt is already authorized', async () => {
    const calls: string[] = []
    const effect = createEffect({
      calls,
      emit: async () => {
        calls.push('provider.emit')
        return { success: true, rawResponse: {} }
      },
      settled: true,
    })

    await effect.execute({ envelope: ENVELOPE })

    expect(calls).toEqual([`isSettled:${COMPANY_ID}:${ATTEMPT_ID}`])
  })

  test('checks the attempt before resolving the certificate of the execution input', async () => {
    const calls: string[] = []
    const effect = createCteIssuanceWorkerEffect({
      createProvider: createProviderStub(async () => ({ success: true, rawResponse: {} })),
      logger: { error: () => {}, info: () => {}, warn: () => {} },
      resolveExecutionInput: async () => {
        calls.push('resolveExecutionInput')
        return EXECUTION_INPUT
      },
      settledAttemptGuard: {
        async isSettled() {
          calls.push('isSettled')
          return true
        },
      },
    })

    await effect.execute({ envelope: ENVELOPE })

    expect(calls).toEqual(['isSettled'])
  })

  test('transmits normally while the attempt is still open', async () => {
    const calls: string[] = []
    const effect = createEffect({
      calls,
      emit: async () => {
        calls.push('provider.emit')
        return {
          success: true,
          chaveAcesso: '35260712345678000190570070001000000011000000019',
          protocolo: '135260000123456',
          rawResponse: {},
        }
      },
      settled: false,
    })

    await effect.execute({ envelope: ENVELOPE })

    expect(calls).toEqual([
      `isSettled:${COMPANY_ID}:${ATTEMPT_ID}`,
      'recordInFlight',
      'provider.emit',
      'recordAuthorized',
    ])
  })

  test('keeps transmitting when no guard is wired', async () => {
    const calls: string[] = []
    const effect = createEffect({
      calls,
      emit: async () => {
        calls.push('provider.emit')
        return {
          success: true,
          chaveAcesso: '35260712345678000190570070001000000011000000019',
          protocolo: '135260000123456',
          rawResponse: {},
        }
      },
    })

    await effect.execute({ envelope: ENVELOPE })

    expect(calls).toEqual(['recordInFlight', 'provider.emit', 'recordAuthorized'])
  })
})

function createProviderStub(emit: CteFiscalProvider['emit']): () => CteFiscalProvider {
  return () => ({
    emit,
    cancel: async () => ({ success: true, rawResponse: {} }),
    testConnection: async () => ({ ok: true, rawResponse: {} }),
  })
}

function createEffect(input: {
  readonly calls: string[]
  readonly emit: CteFiscalProvider['emit']
  readonly settled?: boolean
}) {
  const record = (event: string) => async (): Promise<void> => {
    input.calls.push(event)
  }

  return createCteIssuanceWorkerEffect({
    createProvider: createProviderStub(input.emit),
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    resolveExecutionInput: async () => EXECUTION_INPUT,
    ...(input.settled === undefined
      ? {}
      : {
          settledAttemptGuard: {
            async isSettled(params: {
              readonly attemptId: string
              readonly companyId: string
            }): Promise<boolean> {
              input.calls.push(`isSettled:${params.companyId}:${params.attemptId}`)
              return input.settled === true
            },
          },
        }),
    writeBack: {
      recordAuthorized: record('recordAuthorized'),
      recordCancellationRejected: record('recordCancellationRejected'),
      recordCancelled: record('recordCancelled'),
      recordInFlight: record('recordInFlight'),
      recordRejected: record('recordRejected'),
      recordRetryScheduled: record('recordRetryScheduled'),
    },
  })
}
