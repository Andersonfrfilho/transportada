/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { createCteIssuanceWorkerEffect } from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type {
  CteCancellationDocumentStorage,
  CteStoredXmlObject,
} from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type { CteCancellationExecutionInput } from '../../src/cte-issuance/application/cte-cancellation-input-resolver.service.js'
import type { CteFiscalProvider } from '../../src/cte-issuance/infrastructure/cte-fiscal-gateway.js'
import type { CteProcessingEnvelopeV1 } from '../../src/messaging/cte-processing-envelope.schema.js'

export const ACCESS_KEY = '35260712345678000190570070000000011000000019'
export const AUTHORIZATION_PROTOCOL = '135260000123456'
export const CANCELLATION_PROTOCOL = '135260000987654'
export const CANCELLATION_XML =
  '<?xml version="1.0" encoding="UTF-8"?><procEventoCTe versao="4.00"><eventoCTe/><retEventoCTe/></procEventoCTe>'
export const CERTIFICATE_PASSWORD = 'senha-do-certificado'
export const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
export const FISCAL_DOCUMENTS_BUCKET = 'fiscal-documents'
export const JUSTIFICATION = 'Prestacao de servico nao realizada pelo tomador'

export const ATTEMPT_ID = '7c0f1c2e-6a3b-4f0d-8a52-4b6e5d3c2b10'
export const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'
export const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'

export const CANCEL_ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: 'd1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  companyId: COMPANY_ID,
  correlationId: 'cte-cancellation-contract',
  eventId: 'f1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8',
  occurredAt: '2026-07-27T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-cancellation',
    attemptId: ATTEMPT_ID,
    attemptKind: 'cancel',
    batchId: BATCH_ID,
    batchItemId: BATCH_ITEM_ID,
    status: 'requested',
  },
  type: 'transportada.cte.item.cancel.requested',
  version: 1,
}

export const CANCELLATION_INPUT: CteCancellationExecutionInput = {
  accessKey: ACCESS_KEY,
  authorizationProtocol: AUTHORIZATION_PROTOCOL,
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
  documentId: BATCH_ITEM_ID,
  justification: JUSTIFICATION,
  tenantId: COMPANY_ID,
}

export type CancelledCall = {
  readonly accessKey: string
  readonly cancellationProtocol: string
  readonly xml: CteStoredXmlObject | undefined
}

export type ProviderCancelCall = {
  readonly chaveAcesso: string
  readonly justificativa: string
  readonly protocolo: string | undefined
}

type CancelFixture = {
  readonly cancelledCalls: readonly CancelledCall[]
  readonly effect: ReturnType<typeof createCteIssuanceWorkerEffect>
  readonly envelope: CteProcessingEnvelopeV1
  readonly inFlightCalls: readonly string[]
  readonly providerCalls: readonly ProviderCancelCall[]
  readonly rejectedCalls: ReadonlyArray<{ readonly errorCode: string }>
  readonly retryCalls: ReadonlyArray<{ readonly cause: string }>
  readonly storedXml: ReadonlyArray<{ readonly accessKey: string; readonly companyId: string }>
}

export function createCancellationEffectFixture(input: {
  readonly cancel: CteFiscalProvider['cancel']
  readonly resolveCancellationInput?: () => Promise<CteCancellationExecutionInput | null>
  readonly storeCancellationXml?: CteCancellationDocumentStorage['storeCancellationXml']
}): CancelFixture {
  const cancelledCalls: CancelledCall[] = []
  const inFlightCalls: string[] = []
  const providerCalls: ProviderCancelCall[] = []
  const rejectedCalls: Array<{ readonly errorCode: string }> = []
  const retryCalls: Array<{ readonly cause: string }> = []
  const storedXml: Array<{ readonly accessKey: string; readonly companyId: string }> = []

  const storeCancellationXml: CteCancellationDocumentStorage['storeCancellationXml'] =
    input.storeCancellationXml ??
    (async (params) => {
      storedXml.push({ accessKey: params.accessKey, companyId: params.companyId })
      return {
        bucket: FISCAL_DOCUMENTS_BUCKET,
        key: `tenants/${params.companyId}/cte-documents/${params.accessKey}/cancellation.xml`,
        objectId: crypto.randomUUID(),
        sha256: createHash('sha256').update(params.xml).digest('hex'),
        sizeBytes: Buffer.byteLength(params.xml),
      }
    })

  const effect = createCteIssuanceWorkerEffect({
    cancellationDocumentStorage: { storeCancellationXml },
    createProvider: () => ({
      cancel: async (params) => {
        providerCalls.push({
          chaveAcesso: params.chaveAcesso,
          justificativa: params.justificativa,
          protocolo: params.protocolo,
        })
        return input.cancel(params)
      },
      emit: async () => {
        throw new Error('emit must never run on a cancellation envelope')
      },
      testConnection: async () => ({ ok: true, message: 'ok', rawResponse: {} }),
    }),
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    resolveCancellationInput: input.resolveCancellationInput ?? (async () => CANCELLATION_INPUT),
    resolveExecutionInput: async () => {
      throw new Error('issue resolver must never run on a cancellation envelope')
    },
    writeBack: {
      recordAuthorized: async () => {
        throw new Error('recordAuthorized must never run on a cancellation envelope')
      },
      recordCancellationRejected: async ({ errorCode }) => {
        rejectedCalls.push({ errorCode })
      },
      recordCancelled: async ({ accessKey, cancellationProtocol, xml }) => {
        cancelledCalls.push({ accessKey, cancellationProtocol, xml })
      },
      recordInFlight: async ({ attemptId }) => {
        inFlightCalls.push(attemptId)
      },
      recordRejected: async () => {
        throw new Error('recordRejected must never run on a cancellation envelope')
      },
      recordRetryScheduled: async ({ cause }) => {
        retryCalls.push({ cause })
      },
    },
  })

  return {
    cancelledCalls,
    effect,
    envelope: CANCEL_ENVELOPE,
    inFlightCalls,
    providerCalls,
    rejectedCalls,
    retryCalls,
    storedXml,
  }
}
