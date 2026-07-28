/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { MDFE_PROCESSING_EVENT_TYPE } from '../src/messaging/mdfe-processing-envelope.schema.js'
import type { MdfeProcessingEnvelopeV1 } from '../src/messaging/mdfe-processing-envelope.schema.js'
import { createMdfeIssuanceExecutionInputResolver } from '../src/mdfe-issuance/application/mdfe-issuance-execution-input-resolver.service.js'
import { MdfeIssuanceFatalError } from '../src/mdfe-issuance/application/mdfe-issuance-worker-message-handler.service.js'

const COMPANY_ID = '2a0b2f1e-2f6a-4e1c-9f2c-6b1f0a1d2e3f'
const MANIFEST_ID = '9c2b1a0d-3e4f-4a5b-8c7d-6e5f4a3b2c1d'
const ATTEMPT_ID = '4f3e2d1c-0b9a-4c8d-9e7f-1a2b3c4d5e6f'

const PROVIDER_CONFIG = {
  bairro: 'Bela Vista',
  cep: '01310100',
  cnpj: '12345678000195',
  codigoMunicipio: '3550308',
  crt: '3',
  environment: 'homologation',
  inscricaoEstadual: '110042490114',
  logradouro: 'Av Paulista',
  model: 'mdfe',
  municipio: 'Sao Paulo',
  numero: '1000',
  numeroMdfe: 17,
  razaoSocial: 'Transportadora Exemplo Ltda',
  serie: '1',
  uf: 'SP',
} as const

const PAYLOAD = { ufFim: 'MG', ufInicio: 'SP' } as const

function envelope(): MdfeProcessingEnvelopeV1 {
  return {
    actorId: '11111111-2222-4333-8444-555555555555',
    companyId: COMPANY_ID,
    correlationId: 'corr-1',
    eventId: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
    occurredAt: '2026-07-28T12:00:00.000Z',
    payload: {
      attemptFingerprint: 'fingerprint-1',
      attemptId: ATTEMPT_ID,
      attemptKind: 'issue',
      manifestId: MANIFEST_ID,
      status: 'requested',
    },
    type: MDFE_PROCESSING_EVENT_TYPE.MANIFEST_ISSUE_REQUESTED,
    version: 1,
  }
}

type ResolverOverrides = {
  readonly certificate?: { readonly id: string; readonly secretEnvelope: unknown } | null
  readonly persisted?: { readonly payload: unknown; readonly providerConfig: unknown } | null
}

function createResolver(overrides: ResolverOverrides = {}) {
  const decryptCalls: Record<string, unknown>[] = []

  const resolve = createMdfeIssuanceExecutionInputResolver({
    certificateRepository: {
      findActiveCertificate: async () =>
        overrides.certificate === undefined
          ? { id: 'certificate-1', secretEnvelope: { keyId: 'k1' } }
          : overrides.certificate,
    },
    payloadRepository: {
      findByAttempt: async () =>
        overrides.persisted === undefined
          ? { payload: PAYLOAD, providerConfig: PROVIDER_CONFIG }
          : overrides.persisted,
    },
    secretService: {
      decrypt: async (input) => {
        decryptCalls.push({ ...input })
        return { certificateBase64: 'BASE64CERT', password: 'secret-password' }
      },
    },
  })

  return { decryptCalls, resolve }
}

async function fatal(execute: () => Promise<unknown>): Promise<MdfeIssuanceFatalError> {
  try {
    await execute()
  } catch (error: unknown) {
    if (error instanceof MdfeIssuanceFatalError) return error
    throw error
  }
  throw new Error('expected a MdfeIssuanceFatalError')
}

describe('MDF-e issuance execution input resolver contract', () => {
  // O XML transmitido é o congelado na requisição: remontar aqui mudaria o documento fiscal
  test('reads the frozen payload of the attempt and only then adds the certificate', async () => {
    const { decryptCalls, resolve } = createResolver()

    const input = await resolve({ envelope: envelope() })

    expect(input.mdfeData).toEqual(PAYLOAD)
    expect(input.manifestId).toBe(MANIFEST_ID)
    expect(input.tenantId).toBe(COMPANY_ID)
    expect(input.config).toMatchObject({
      certificadoBase64: 'BASE64CERT',
      certificadoSenha: 'secret-password',
      environment: 'homologation',
      numeroMdfe: 17,
      serie: '1',
    })
    expect(decryptCalls).toEqual([
      {
        certificateId: 'certificate-1',
        companyId: COMPANY_ID,
        envelope: { keyId: 'k1' },
        purpose: 'mdfe',
      },
    ])
  })

  test('never carries the provider model discriminator into the gateway config', async () => {
    const { resolve } = createResolver()

    const input = await resolve({ envelope: envelope() })

    expect(input.config).not.toHaveProperty('model')
  })

  test('dead-letters an attempt whose payload was never frozen', async () => {
    const { resolve } = createResolver({ persisted: null })

    const error = await fatal(() => resolve({ envelope: envelope() }))

    expect(error.message).toBe('mdfe issuance payload not found for attempt')
  })

  test('dead-letters a provider config that lost a mandatory emitter field', async () => {
    const { resolve } = createResolver({
      persisted: {
        payload: PAYLOAD,
        providerConfig: { ...PROVIDER_CONFIG, cnpj: '' },
      },
    })

    const error = await fatal(() => resolve({ envelope: envelope() }))

    expect(error.message).toBe('persisted MDF-e provider config is incomplete')
  })

  test('dead-letters a company without an active MDF-e certificate', async () => {
    const { resolve } = createResolver({ certificate: null })

    const error = await fatal(() => resolve({ envelope: envelope() }))

    expect(error.message).toBe('company has no active MDF-e certificate')
  })
})
