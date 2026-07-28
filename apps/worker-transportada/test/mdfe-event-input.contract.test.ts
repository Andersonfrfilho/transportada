/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createMdfeCancellationInputResolver } from '../src/mdfe-issuance/application/mdfe-cancellation-input-resolver.service.js'
import { createMdfeClosureInputResolver } from '../src/mdfe-issuance/application/mdfe-closure-input-resolver.service.js'
import { MDFE_PROCESSING_EVENT_TYPE } from '../src/messaging/mdfe-processing-envelope.schema.js'
import type { MdfeEventTarget } from '../src/mdfe-issuance/infrastructure/drizzle-mdfe-event-target.repository.js'
import type { MdfeProcessingEnvelopeV1 } from '../src/messaging/mdfe-processing-envelope.schema.js'

const COMPANY_ID = '2a0b2f1e-2f6a-4e1c-9f2c-6b1f0a1d2e3f'
const MANIFEST_ID = '9c2b1a0d-3e4f-4a5b-8c7d-6e5f4a3b2c1d'
const ATTEMPT_ID = '4f3e2d1c-0b9a-4c8d-9e7f-1a2b3c4d5e6f'
const ISSUANCE_ATTEMPT_ID = '11111111-2222-4333-8444-555555555555'
const ACTOR_ID = '6f5e4d3c-2b1a-4098-8765-4321fedcba09'
const EVENT_ID = '77777777-8888-4999-8aaa-bbbbbbbbbbbb'
const ACCESS_KEY = '3'.repeat(44)
const CERTIFICATE_ID = '88888888-9999-4aaa-8bbb-cccccccccccc'

const PROVIDER_CONFIG = {
  bairro: 'Centro',
  cep: '01001000',
  cnpj: '12345678000195',
  codigoMunicipio: '3550308',
  crt: '3',
  environment: 'homologation',
  inscricaoEstadual: '123456789',
  logradouro: 'Rua Um',
  municipio: 'Sao Paulo',
  numero: '100',
  numeroMdfe: 7,
  razaoSocial: 'Transportadora Exemplo Ltda',
  serie: '1',
  uf: 'SP',
} as const

function buildEnvelope(type: MdfeProcessingEnvelopeV1['type']): MdfeProcessingEnvelopeV1 {
  return {
    actorId: ACTOR_ID,
    companyId: COMPANY_ID,
    correlationId: 'corr-1',
    eventId: EVENT_ID,
    occurredAt: '2026-07-28T02:30:00.000Z',
    payload: {
      attemptFingerprint: 'fingerprint-1',
      attemptId: ATTEMPT_ID,
      attemptKind:
        type === MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED ? 'close' : 'cancel',
      manifestId: MANIFEST_ID,
      status: 'requested',
    },
    type,
    version: 1,
  }
}

function buildTarget(overrides: Partial<MdfeEventTarget> = {}): MdfeEventTarget {
  return {
    accessKey: ACCESS_KEY,
    authorizationProtocol: 'PROTO-AUT-01',
    cancellationJustification: 'Manifesto emitido em duplicidade operacional',
    closureCityCode: '3304557',
    closureState: 'RJ',
    issuanceAttemptId: ISSUANCE_ATTEMPT_ID,
    status: 'authorized',
    ...overrides,
  }
}

function buildDependencies(target: MdfeEventTarget | null) {
  const payloadCalls: unknown[] = []
  return {
    certificateRepository: {
      async findActiveCertificate() {
        return { id: CERTIFICATE_ID, secretEnvelope: { cipher: 'x' } }
      },
    },
    eventTargetRepository: {
      async findAuthorizedDocument() {
        return target
      },
    },
    payloadCalls,
    payloadRepository: {
      async findByAttempt(input: { readonly attemptId: string; readonly companyId: string }) {
        payloadCalls.push(input)
        return {
          payload: { manifest: true },
          providerConfig: PROVIDER_CONFIG,
        }
      },
    },
    secretService: {
      async decrypt() {
        return { certificateBase64: 'BASE64', password: 'senha' }
      },
    },
  }
}

describe('mdfe closure input resolver', () => {
  test('devolve null quando não existe documento fiscal autorizado', async () => {
    const dependencies = buildDependencies(null)
    const resolve = createMdfeClosureInputResolver(dependencies)

    const result = await resolve({
      envelope: buildEnvelope(MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED),
    })

    expect(result).toBeNull()
  })

  test('resolve encerramento usando a tentativa de emissão e a data de Brasília', async () => {
    const dependencies = buildDependencies(buildTarget())
    const resolve = createMdfeClosureInputResolver(dependencies)

    const result = await resolve({
      envelope: buildEnvelope(MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED),
    })

    expect(dependencies.payloadCalls).toEqual([
      { attemptId: ISSUANCE_ATTEMPT_ID, companyId: COMPANY_ID },
    ])
    expect(result).toEqual({
      accessKey: ACCESS_KEY,
      authorizationProtocol: 'PROTO-AUT-01',
      closureCityCode: '3304557',
      closureDate: '2026-07-27',
      closureState: 'RJ',
      config: {
        ...PROVIDER_CONFIG,
        certificadoBase64: 'BASE64',
        certificadoSenha: 'senha',
      },
      manifestId: MANIFEST_ID,
      tenantId: COMPANY_ID,
    })
  })

  test('falha fatal quando o município ou a UF de encerramento não foram registrados', async () => {
    const dependencies = buildDependencies(buildTarget({ closureState: null }))
    const resolve = createMdfeClosureInputResolver(dependencies)

    await expect(
      resolve({ envelope: buildEnvelope(MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED) }),
    ).rejects.toThrow('mdfe closure request is missing city or state')
  })
})

describe('mdfe cancellation input resolver', () => {
  test('devolve null quando não existe documento fiscal autorizado', async () => {
    const dependencies = buildDependencies(null)
    const resolve = createMdfeCancellationInputResolver(dependencies)

    const result = await resolve({
      envelope: buildEnvelope(MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED),
    })

    expect(result).toBeNull()
  })

  test('resolve cancelamento com a justificativa persistida', async () => {
    const dependencies = buildDependencies(buildTarget())
    const resolve = createMdfeCancellationInputResolver(dependencies)

    const result = await resolve({
      envelope: buildEnvelope(MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED),
    })

    expect(result).toEqual({
      accessKey: ACCESS_KEY,
      authorizationProtocol: 'PROTO-AUT-01',
      config: {
        ...PROVIDER_CONFIG,
        certificadoBase64: 'BASE64',
        certificadoSenha: 'senha',
      },
      justification: 'Manifesto emitido em duplicidade operacional',
      manifestId: MANIFEST_ID,
      tenantId: COMPANY_ID,
    })
  })

  test('falha fatal quando a justificativa persistida tem menos de 15 caracteres', async () => {
    const dependencies = buildDependencies(buildTarget({ cancellationJustification: 'curta' }))
    const resolve = createMdfeCancellationInputResolver(dependencies)

    await expect(
      resolve({ envelope: buildEnvelope(MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED) }),
    ).rejects.toThrow('mdfe cancellation justification is too short')
  })
})
