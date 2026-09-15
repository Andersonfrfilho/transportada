/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCteIssuanceWorkerEffect } from '../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import { CteIssuanceFatalError } from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import type { CteIssuanceExecutionInput } from '../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import { CTE_BATCH_DOCUMENT_NOT_AUTHORIZED } from '../src/cte-issuance/domain/cte-batch-block-reason.constant.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'

const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
const ATTEMPT_ID = '7c0f1c2e-6a3b-4f0d-8a52-4b6e5d3c2b10'
const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'
const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'

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
  readonly isAuthorized: (params: {
    readonly batchItemId: string
    readonly companyId: string
  }) => Promise<boolean>
}) {
  const gatewayCalls: string[] = []
  const rejectedCalls: Array<{ readonly errorCode: string }> = []
  const authorizedCalls: string[] = []
  const inFlightCalls: string[] = []

  const effect = createCteIssuanceWorkerEffect({
    createProvider: () => ({
      cancel: async () => {
        throw new Error('cancel must never run on an issue envelope')
      },
      emit: async () => {
        gatewayCalls.push('emit')
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
    documentAuthorizationCheck: { isAuthorized: input.isAuthorized },
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    resolveExecutionInput: async () => EXECUTION_INPUT,
    writeBack: {
      recordAuthorized: async ({ attemptId }) => {
        authorizedCalls.push(attemptId)
      },
      recordCancellationRejected: async () => {},
      recordCancelled: async () => {},
      recordInFlight: async ({ attemptId }) => {
        inFlightCalls.push(attemptId)
      },
      recordRejected: async ({ errorCode }) => {
        rejectedCalls.push({ errorCode })
      },
      recordRetryScheduled: async () => {},
    },
  })

  return { authorizedCalls, effect, gatewayCalls, inFlightCalls, rejectedCalls }
}

describe('CT-e issuance document authorization contract (spec 149 T4)', () => {
  test('fails the item with CTE_BATCH_DOCUMENT_NOT_AUTHORIZED without reaching the fiscal gateway', async () => {
    const checkedKeys: Array<{ readonly batchItemId: string; readonly companyId: string }> = []
    const fixture = createFixture({
      isAuthorized: async (params) => {
        checkedKeys.push(params)
        return false
      },
    })

    await expect(fixture.effect.execute({ envelope: ISSUE_ENVELOPE })).rejects.toBeInstanceOf(
      CteIssuanceFatalError,
    )

    expect(checkedKeys).toEqual([{ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID }])
    expect(fixture.gatewayCalls).toEqual([])
    expect(fixture.rejectedCalls).toEqual([{ errorCode: CTE_BATCH_DOCUMENT_NOT_AUTHORIZED }])
  })

  test('proceeds to the fiscal gateway when the note is still authorized', async () => {
    const fixture = createFixture({ isAuthorized: async () => true })

    await fixture.effect.execute({ envelope: ISSUE_ENVELOPE })

    expect(fixture.gatewayCalls).toEqual(['emit'])
    expect(fixture.rejectedCalls).toEqual([])
    expect(fixture.authorizedCalls).toEqual([ATTEMPT_ID])
  })
})
