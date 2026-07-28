/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createCteIssuanceWorkerEffect,
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
} from '../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import { resolveCteBatchStatus } from '../src/cte-issuance/domain/cte-batch-progress.policy.js'
import type { CteIssuanceExecutionInput } from '../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'
import type { CteFiscalProvider } from '../src/cte-issuance/infrastructure/cte-fiscal-gateway.js'

const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
const ATTEMPT_ID = '3fa2f0f4-0f2b-4f8c-9c2f-1e0f9a5b7d21'
const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'
const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'
const CERTIFICATE_PASSWORD = 'senha-do-certificado'

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: 'd1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  companyId: COMPANY_ID,
  correlationId: 'write-back-contract',
  eventId: 'e7f8a9b0-1c2d-4e3f-9a5b-6c7d8e9f0a1b',
  occurredAt: '2026-07-27T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-write-back',
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
    certificadoSenha: CERTIFICATE_PASSWORD,
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

const EXPECTED_KEY = {
  attemptId: ATTEMPT_ID,
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  companyId: COMPANY_ID,
}

function createProviderStub(emit: CteFiscalProvider['emit']): () => CteFiscalProvider {
  return () => ({
    emit,
    cancel: async () => ({ success: true, rawResponse: {} }),
    testConnection: async () => ({ ok: true, rawResponse: {} }),
  })
}

function createEffect(input: {
  readonly calls: Array<Record<string, unknown>>
  readonly emit: CteFiscalProvider['emit']
}) {
  const record =
    (event: string) =>
    async (payload: Record<string, unknown>): Promise<void> => {
      input.calls.push({ event, ...payload })
    }

  return createCteIssuanceWorkerEffect({
    createProvider: createProviderStub(input.emit),
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    resolveExecutionInput: async () => EXECUTION_INPUT,
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

describe('CT-e batch progress policy', () => {
  test('keeps the batch in flight while any item is still pending', () => {
    expect(resolveCteBatchStatus(['authorized', 'pending'])).toBe('in_flight')
    expect(resolveCteBatchStatus(['in_flight'])).toBe('in_flight')
    expect(resolveCteBatchStatus(['authorized', 'retry_scheduled'])).toBe('in_flight')
  })

  test('closes the batch as done when every item is authorized or cancelled', () => {
    expect(resolveCteBatchStatus(['authorized', 'authorized'])).toBe('done')
    expect(resolveCteBatchStatus(['authorized', 'cancelled'])).toBe('done')
  })

  test('closes the batch as error when any settled item did not get authorized', () => {
    expect(resolveCteBatchStatus(['authorized', 'rejected'])).toBe('error')
    expect(resolveCteBatchStatus(['failed'])).toBe('error')
    expect(resolveCteBatchStatus(['authorized', 'reconciliation_required'])).toBe('error')
  })

  test('leaves an empty batch as submitted', () => {
    expect(resolveCteBatchStatus([])).toBe('submitted')
  })
})

describe('CT-e issuance write-back contract', () => {
  test('marks the attempt in flight before transmitting and authorized with key and protocol', async () => {
    const calls: Array<Record<string, unknown>> = []
    const effect = createEffect({
      calls,
      emit: async () => {
        calls.push({ event: 'provider.emit' })
        return {
          success: true,
          chaveAcesso: '35260712345678000190570070001000000011000000019',
          protocolo: '135260000123456',
          rawResponse: {},
        }
      },
    })

    await effect.execute({ envelope: ENVELOPE })

    expect(calls).toEqual([
      { event: 'recordInFlight', ...EXPECTED_KEY, occurredAt: expect.any(Date) },
      { event: 'provider.emit' },
      {
        event: 'recordAuthorized',
        ...EXPECTED_KEY,
        accessKey: '35260712345678000190570070001000000011000000019',
        occurredAt: expect.any(Date),
        protocol: '135260000123456',
      },
    ])
  })

  test('records the SEFAZ rejection code before failing the attempt', async () => {
    const calls: Array<Record<string, unknown>> = []
    const effect = createEffect({
      calls,
      emit: async () => ({ success: false, errorCode: '539', rawResponse: {} }),
    })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toBeInstanceOf(
      CteIssuanceFatalError,
    )

    expect(calls).toEqual([
      { event: 'recordInFlight', ...EXPECTED_KEY, occurredAt: expect.any(Date) },
      { event: 'recordRejected', ...EXPECTED_KEY, errorCode: '539', occurredAt: expect.any(Date) },
    ])
  })

  test('records a retry when the transmission fails for a recoverable reason', async () => {
    const calls: Array<Record<string, unknown>> = []
    const effect = createEffect({
      calls,
      emit: async () => {
        const error = new Error('sefaz timed out')
        error.name = 'FiscalTimeoutError'
        throw error
      },
    })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toBeInstanceOf(
      CteIssuanceRecoverableError,
    )

    expect(calls).toEqual([
      { event: 'recordInFlight', ...EXPECTED_KEY, occurredAt: expect.any(Date) },
      {
        event: 'recordRetryScheduled',
        ...EXPECTED_KEY,
        cause: 'FiscalTimeoutError',
        occurredAt: expect.any(Date),
      },
    ])
  })

  test('never hands certificate material to the write-back', async () => {
    const calls: Array<Record<string, unknown>> = []
    const effect = createEffect({
      calls,
      emit: async () => ({ success: true, protocolo: '135260000123456', rawResponse: {} }),
    })

    await effect.execute({ envelope: ENVELOPE })

    const serialized = JSON.stringify(calls)
    expect(serialized).not.toContain(CERTIFICATE_PASSWORD)
    expect(serialized).not.toContain('BASE64CERT')
  })
})
