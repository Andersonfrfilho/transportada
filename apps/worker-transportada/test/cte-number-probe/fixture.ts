/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createCteIssuanceWorkerEffect } from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type { CteFiscalNumberProbe } from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type { CteIssuanceExecutionInput } from '../../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import type { CteProcessingEnvelopeV1 } from '../../src/messaging/cte-processing-envelope.schema.js'

export const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
export const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'
export const DUPLICATE_NUMBER_CODE = '539'
export const CONTENT_REJECTION_CODE = '225'
export const RESERVED_NUMBER = 2

const ATTEMPT_ID = '3fa2f0f4-0f2b-4f8c-9c2f-1e0f9a5b7d21'
const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: 'd1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  companyId: COMPANY_ID,
  correlationId: 'number-probe-contract',
  eventId: 'e7f8a9b0-1c2d-4e3f-9a5b-6c7d8e9f0a1b',
  occurredAt: '2026-08-06T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-number-probe',
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
    environment: 'homologation',
    inscricaoEstadual: '111222333444',
    logradouro: 'Rua das Transportadoras',
    municipio: 'Jundiai',
    numero: '250',
    numeroCte: RESERVED_NUMBER,
    razaoSocial: 'Transportadora Exemplo LTDA',
    rntrc: '12345678',
    serie: '1',
    uf: 'SP',
  },
  cteData: { valorTotalReceber: 480.5 },
  documentId: BATCH_ITEM_ID,
  tenantId: COMPANY_ID,
}

export type ProbeCall = {
  readonly burnedNumber: number
  readonly rejectionCode: string
}

export type EffectFixture = {
  readonly effect: ReturnType<typeof createCteIssuanceWorkerEffect>
  readonly envelope: CteProcessingEnvelopeV1
  readonly probeCalls: readonly ProbeCall[]
  readonly rejectedCodes: readonly string[]
  readonly retryCauses: readonly string[]
}

export function createProbeFixture(input: {
  readonly errorCode: string
  readonly probeOutcome?: 'advanced' | 'exhausted'
}): EffectFixture {
  const probeCalls: ProbeCall[] = []
  const rejectedCodes: string[] = []
  const retryCauses: string[] = []

  const fiscalNumberProbe: CteFiscalNumberProbe = {
    async advance(params) {
      probeCalls.push({
        burnedNumber: params.burnedNumber,
        rejectionCode: params.rejectionCode,
      })
      if (input.probeOutcome === 'exhausted') return { outcome: 'exhausted' }
      return { nextNumber: params.burnedNumber + 1, outcome: 'advanced' }
    },
  }

  const effect = createCteIssuanceWorkerEffect({
    createProvider: () => ({
      cancel: async () => ({ success: true, rawResponse: {} }),
      emit: async () => ({ errorCode: input.errorCode, rawResponse: {}, success: false }),
      testConnection: async () => ({ ok: true, rawResponse: {} }),
    }),
    fiscalNumberProbe,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    resolveExecutionInput: async () => EXECUTION_INPUT,
    writeBack: {
      recordAuthorized: async () => {},
      recordCancellationRejected: async () => {},
      recordCancelled: async () => {},
      recordInFlight: async () => {},
      recordRejected: async ({ errorCode }) => {
        rejectedCodes.push(errorCode)
      },
      recordRetryScheduled: async ({ cause }) => {
        retryCauses.push(cause)
      },
    },
  })

  return { effect, envelope: ENVELOPE, probeCalls, rejectedCodes, retryCauses }
}
