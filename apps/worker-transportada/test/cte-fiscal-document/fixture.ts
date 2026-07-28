/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { createCteIssuanceWorkerEffect } from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type {
  CteAuthorizedDocumentStorage,
  CteIssuanceFiscalDocument,
} from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type { CteIssuanceExecutionInput } from '../../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import type { CteFiscalProvider } from '../../src/cte-issuance/infrastructure/cte-fiscal-gateway.js'
import type { CteProcessingEnvelopeV1 } from '../../src/messaging/cte-processing-envelope.schema.js'

export const ACCESS_KEY = '35260712345678000190570070000000011000000019'
export const AUTHORIZED_XML =
  '<?xml version="1.0" encoding="UTF-8"?><cteProc versao="4.00"><CTe/><protCTe/></cteProc>'
export const CERTIFICATE_PASSWORD = 'senha-do-certificado'
export const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'
export const FISCAL_DOCUMENTS_BUCKET = 'fiscal-documents'

const ATTEMPT_ID = '3fa2f0f4-0f2b-4f8c-9c2f-1e0f9a5b7d21'
const BATCH_ID = 'b4b0d6b3-8f0a-4d64-8c8b-9de0c0f9a7c2'
const BATCH_ITEM_ID = 'c9d1a2f6-46bd-4d2f-9e1b-2a53f9c0a3d4'

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: 'd1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  companyId: COMPANY_ID,
  correlationId: 'fiscal-document-contract',
  eventId: 'e7f8a9b0-1c2d-4e3f-9a5b-6c7d8e9f0a1b',
  occurredAt: '2026-07-27T12:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-fiscal-document',
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

type AuthorizedCall = {
  readonly accessKey: string | undefined
  readonly fiscalDocument: CteIssuanceFiscalDocument | undefined
  readonly protocol: string | undefined
}

export function createEffectFixture(input: {
  readonly emit: CteFiscalProvider['emit']
  readonly storeAuthorizedXml?: CteAuthorizedDocumentStorage['storeAuthorizedXml']
}): {
  readonly authorizedCalls: readonly AuthorizedCall[]
  readonly effect: ReturnType<typeof createCteIssuanceWorkerEffect>
  readonly envelope: CteProcessingEnvelopeV1
  readonly storedXml: ReadonlyArray<{ readonly accessKey: string; readonly companyId: string }>
} {
  const authorizedCalls: AuthorizedCall[] = []
  const storedXml: Array<{ readonly accessKey: string; readonly companyId: string }> = []

  const storeAuthorizedXml: CteAuthorizedDocumentStorage['storeAuthorizedXml'] =
    input.storeAuthorizedXml ??
    (async (params) => {
      storedXml.push({ accessKey: params.accessKey, companyId: params.companyId })
      return {
        bucket: FISCAL_DOCUMENTS_BUCKET,
        key: `tenants/${params.companyId}/cte-documents/${params.accessKey}/authorized.xml`,
        objectId: crypto.randomUUID(),
        sha256: createHash('sha256').update(params.xml).digest('hex'),
        sizeBytes: Buffer.byteLength(params.xml),
      }
    })

  const effect = createCteIssuanceWorkerEffect({
    authorizedDocumentStorage: { storeAuthorizedXml },
    createProvider: () => ({
      cancel: async () => ({ success: true, rawResponse: {} }),
      emit: input.emit,
      testConnection: async () => ({ ok: true, rawResponse: {} }),
    }),
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    resolveExecutionInput: async () => EXECUTION_INPUT,
    writeBack: {
      recordAuthorized: async ({ accessKey, fiscalDocument, protocol }) => {
        authorizedCalls.push({ accessKey, fiscalDocument, protocol })
      },
      recordCancellationRejected: async () => {},
      recordCancelled: async () => {},
      recordInFlight: async () => {},
      recordRejected: async () => {},
      recordRetryScheduled: async () => {},
    },
  })

  return { authorizedCalls, effect, envelope: ENVELOPE, storedXml }
}
