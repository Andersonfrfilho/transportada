/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCteIssuanceWorkerEffect } from '../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import { createCteIssuanceExecutionInputResolver } from '../src/cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import { CteIssuanceFatalError } from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'

const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const ATTEMPT_ID = '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d'
const BATCH_ITEM_ID = '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8'
const CERTIFICATE_ID = 'd6b4a2ec-2a2f-4c53-9f6a-0f7f3d9f2c11'
const CERTIFICATE_BASE64 = 'BASE64CERT'
const CERTIFICATE_PASSWORD = 'senha-do-certificado'

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: COMPANY_ID,
  correlationId: 'contract-test-correlation',
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  occurredAt: '2026-07-22T20:00:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-001',
    attemptId: ATTEMPT_ID,
    attemptKind: 'issue',
    batchId: 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d',
    batchItemId: BATCH_ITEM_ID,
    status: 'requested',
  },
  type: 'transportada.cte.item.issue.requested',
  version: 1,
}

const PROVIDER_CONFIG = {
  bairro: 'Centro',
  cep: '13480000',
  cnpj: '12345678000190',
  codigoMunicipio: '3526902',
  crt: '3',
  environment: 'production',
  inscricaoEstadual: '123456789',
  logradouro: 'Rua das Transportadoras',
  model: 'cte',
  municipio: 'Limeira',
  numero: '100',
  numeroCte: 100000001,
  razaoSocial: 'Transportadora Exemplo LTDA',
  rntrc: '12345678',
  serie: '7',
  uf: 'SP',
} as const

const CTE_DATA = {
  valorTotalPrestacao: 43.13,
  valorTotalReceber: 43.13,
} as const

const CERTIFICATE = { id: CERTIFICATE_ID, secretEnvelope: { keyId: 'k1' } } as const

function createSecretService(calls: unknown[]) {
  return {
    async decrypt(params: {
      readonly certificateId: string
      readonly companyId: string
      readonly envelope: unknown
      readonly purpose: 'cte'
    }) {
      calls.push({ event: 'decrypt', ...params })
      return { certificateBase64: CERTIFICATE_BASE64, password: CERTIFICATE_PASSWORD }
    },
  }
}

function createResolver(input: {
  readonly calls: unknown[]
  readonly certificate?: { readonly id: string; readonly secretEnvelope: unknown } | null
  readonly persisted?: { readonly payload: unknown; readonly providerConfig: unknown } | null
}) {
  return createCteIssuanceExecutionInputResolver({
    certificateRepository: {
      async findActiveCertificate(params: { readonly companyId: string }) {
        input.calls.push({ event: 'findActiveCertificate', ...params })
        return input.certificate === undefined ? CERTIFICATE : input.certificate
      },
    },
    payloadRepository: {
      async findByAttempt(params: { readonly attemptId: string; readonly companyId: string }) {
        input.calls.push({ event: 'findByAttempt', ...params })
        return input.persisted === undefined
          ? { payload: CTE_DATA, providerConfig: PROVIDER_CONFIG }
          : input.persisted
      },
    },
    secretService: createSecretService(input.calls),
  })
}

describe('CT-e issuance execution input contract', () => {
  test('builds the execution input from the persisted payload of the attempt', async () => {
    const calls: unknown[] = []
    const resolver = createResolver({ calls })

    const executionInput = await resolver({ envelope: ENVELOPE })

    expect(calls[0]).toEqual({
      event: 'findByAttempt',
      attemptId: ATTEMPT_ID,
      companyId: COMPANY_ID,
    })
    expect(executionInput.cteData).toEqual(CTE_DATA)
    expect(executionInput.tenantId).toBe(COMPANY_ID)
    expect(executionInput.documentId).toBe(BATCH_ITEM_ID)
    expect(executionInput.config).toMatchObject({
      bairro: 'Centro',
      cep: '13480000',
      cnpj: '12345678000190',
      codigoMunicipio: '3526902',
      crt: '3',
      environment: 'production',
      inscricaoEstadual: '123456789',
      logradouro: 'Rua das Transportadoras',
      municipio: 'Limeira',
      numero: '100',
      numeroCte: 100000001,
      razaoSocial: 'Transportadora Exemplo LTDA',
      rntrc: '12345678',
      serie: '7',
      uf: 'SP',
    })
  })

  test('injects the decrypted certificate that the persisted config never carries', async () => {
    const calls: unknown[] = []
    const resolver = createResolver({ calls })

    const executionInput = await resolver({ envelope: ENVELOPE })

    expect(JSON.stringify(PROVIDER_CONFIG)).not.toContain(CERTIFICATE_BASE64)
    expect(calls).toContainEqual({
      event: 'decrypt',
      certificateId: CERTIFICATE_ID,
      companyId: COMPANY_ID,
      envelope: CERTIFICATE.secretEnvelope,
      purpose: 'cte',
    })
    expect(executionInput.config.certificadoBase64).toBe(CERTIFICATE_BASE64)
    expect(executionInput.config.certificadoSenha).toBe(CERTIFICATE_PASSWORD)
  })

  test('fails the attempt when the persisted payload is missing', async () => {
    const calls: unknown[] = []
    const resolver = createResolver({ calls, persisted: null })

    await expect(resolver({ envelope: ENVELOPE })).rejects.toBeInstanceOf(CteIssuanceFatalError)
    expect(calls.filter((call) => (call as { event: string }).event === 'decrypt')).toEqual([])
  })

  test('fails the attempt when the company has no active CT-e certificate', async () => {
    const calls: unknown[] = []
    const resolver = createResolver({ calls, certificate: null })

    await expect(resolver({ envelope: ENVELOPE })).rejects.toBeInstanceOf(CteIssuanceFatalError)
  })

  test('rejects a persisted provider config that lost required fiscal fields', async () => {
    const withoutSeries: Record<string, unknown> = { ...PROVIDER_CONFIG }
    delete withoutSeries.serie
    const resolver = createResolver({
      calls: [],
      persisted: { payload: CTE_DATA, providerConfig: withoutSeries },
    })

    await expect(resolver({ envelope: ENVELOPE })).rejects.toBeInstanceOf(CteIssuanceFatalError)
  })

  test('hands the complete config to the fiscal provider without fabricated empty fields', async () => {
    const calls: unknown[] = []
    const logs: Array<Record<string, unknown>> = []
    const resolver = createResolver({ calls })
    const effect = createCteIssuanceWorkerEffect({
      createProvider({ config }) {
        calls.push({ event: 'createProvider', config })
        return {
          emit: async (emitInput) => {
            calls.push({ event: 'emit', cteData: emitInput.cteData })
            return { success: true, protocolo: 'PROTO-01', rawResponse: undefined }
          },
          cancel: async () => ({ success: true, rawResponse: undefined }),
          testConnection: async () => ({ ok: true, message: 'ok', rawResponse: undefined }),
        }
      },
      logger: {
        info: (message: string, metadata?: Record<string, unknown>) => {
          logs.push({ message, ...metadata })
        },
        error: () => undefined,
        warn: () => undefined,
      },
      resolveExecutionInput: resolver,
    })

    await effect.execute({ envelope: ENVELOPE })

    const providerCall = calls.find(
      (call) => (call as { event: string }).event === 'createProvider',
    ) as { readonly config: Record<string, unknown> }
    expect(providerCall.config).toMatchObject({
      model: 'cte',
      environment: 'producao',
      certificadoBase64: CERTIFICATE_BASE64,
      certificadoSenha: CERTIFICATE_PASSWORD,
      codigoMunicipio: '3526902',
      crt: '3',
      inscricaoEstadual: '123456789',
      municipio: 'Limeira',
      numeroCte: 100000001,
      razaoSocial: 'Transportadora Exemplo LTDA',
      rntrc: '12345678',
      serie: '7',
    })
    expect(calls).toContainEqual({ event: 'emit', cteData: CTE_DATA })
    expect(JSON.stringify(logs)).not.toContain(CERTIFICATE_BASE64)
    expect(JSON.stringify(logs)).not.toContain(CERTIFICATE_PASSWORD)
    expect(logs.some((entry) => entry['message'] === 'cte_issuance_worker_effect_authorized')).toBe(
      true,
    )
  })
})
