/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 T013 / ADR-0057 §3: o documento do recebedor só entra quando a configuração resolvida o
 * pede, persiste em envelope A256GCM, e sai mascarado em toda leitura.
 */
import { describe, expect, it } from 'bun:test'

import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import {
  attachDeliveryProof,
  type DeliveryProofPort,
  type DeliveryProofStoragePort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  maskTaxId,
  resolveDeliveryProofSettings,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const OBJECT_ID = '00000000-0000-4000-8000-000000000006'
const PROOF_ID = '00000000-0000-4000-8000-000000000007'

const ENVELOPE: SecretEnvelopeV1 = {
  algorithm: 'A256GCM',
  ciphertext: 'ciphertext',
  keyId: 'key-1',
  nonce: 'nonce',
  version: 1,
}

type SavedProof = Parameters<DeliveryProofPort['saveProof']>[0]

function buildWorld(settings: Partial<DeliveryProofFieldSettings> = {}) {
  const saved: SavedProof[] = []
  const sealed: Array<{
    readonly companyId: string
    readonly proofId: string
    readonly receiverDocument: string
  }> = []

  const repository: DeliveryProofPort = {
    findDeliveryEventId: () => Promise.resolve(EVENT_ID),
    resolveProofFieldSettings: () =>
      Promise.resolve({ ...DEFAULT_DELIVERY_PROOF_SETTINGS, ...settings }),
    saveProof: (proof) => {
      saved.push(proof)
      return Promise.resolve({ id: proof.id })
    },
  }
  const storage: DeliveryProofStoragePort = {
    store: () => Promise.resolve({ sha256: 'a'.repeat(64) }),
  }

  return { repository, saved, sealed, storage }
}

function buildInput(
  world: ReturnType<typeof buildWorld>,
  upload: Partial<Parameters<typeof attachDeliveryProof>[0]['upload']> = {},
) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    newObjectId: () => OBJECT_ID,
    newProofId: () => PROOF_ID,
    repository: world.repository,
    sealDocument: (input: {
      readonly companyId: string
      readonly proofId: string
      readonly receiverDocument: string
    }) => {
      world.sealed.push(input)
      return Promise.resolve(ENVELOPE)
    },
    storage: world.storage,
    upload: {
      bytes: new Uint8Array(1024),
      kind: 'signature' as const,
      mimeType: 'image/png',
      receiverDocument: '',
      receiverName: 'Maria de Sousa',
      ...upload,
    },
  }
}

async function expectApiError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
  }
}

describe('a máscara do documento (ADR-0057 §3)', () => {
  it('esconde tudo menos os dígitos 4 a 9 do CPF', () => {
    expect(maskTaxId('93893857001')).toBe('***.938.570-**')
    expect(maskTaxId('12345678901')).toBe('***.456.789-**')
  })

  it('esconde o CNPJ inteiro menos o miolo', () => {
    expect(maskTaxId('12ABC345000199')).toBe('**.***.450/****-**')
  })

  it('valor fora de forma sai todo mascarado, nunca em claro', () => {
    expect(maskTaxId('123')).toBe('***')
    expect(maskTaxId('')).toBe('')
  })
})

describe('a resolução da configuração (ADR-0057 §1)', () => {
  it('sem linha nenhuma vale o padrão de fábrica, com documento desligado', () => {
    const resolved = resolveDeliveryProofSettings({ general: null, override: null })

    expect(resolved).toEqual({
      photo: 'optional',
      receiverDocument: 'off',
      receiverName: 'optional',
      signature: 'optional',
    })
  })

  it('a exceção por CNPJ vence a configuração geral por inteiro', () => {
    const general: DeliveryProofFieldSettings = {
      photo: 'required',
      receiverDocument: 'off',
      receiverName: 'required',
      signature: 'required',
    }
    const override: DeliveryProofFieldSettings = {
      photo: 'off',
      receiverDocument: 'required',
      receiverName: 'optional',
      signature: 'optional',
    }

    expect(resolveDeliveryProofSettings({ general, override })).toEqual(override)
  })
})

describe('o documento do recebedor no comprovante (spec 082 T013)', () => {
  it('com a configuração em off, documento enviado é recusado', async () => {
    const world = buildWorld({ receiverDocument: 'off' })

    await expectApiError(
      attachDeliveryProof(buildInput(world, { receiverDocument: '93893857001' })),
      'TRIP_DELIVERY_PROOF_DOCUMENT_NOT_ACCEPTED',
    )
    expect(world.saved).toHaveLength(0)
  })

  it('com a configuração em required, assinatura sem documento é recusada', async () => {
    const world = buildWorld({ receiverDocument: 'required' })

    await expectApiError(
      attachDeliveryProof(buildInput(world, { receiverDocument: '' })),
      'TRIP_DELIVERY_PROOF_DOCUMENT_REQUIRED',
    )
  })

  it('required não alcança a foto: o documento é da assinatura', async () => {
    const world = buildWorld({ receiverDocument: 'required' })

    const result = await attachDeliveryProof(
      buildInput(world, { kind: 'photo', receiverDocument: '', receiverName: '' }),
    )

    expect(result.id).toBe(PROOF_ID)
  })

  it('aceito, o documento persiste como envelope e máscara — nunca em claro', async () => {
    const world = buildWorld({ receiverDocument: 'optional' })

    await attachDeliveryProof(buildInput(world, { receiverDocument: '93893857001' }))

    expect(world.sealed).toEqual([
      { companyId: COMPANY_ID, proofId: PROOF_ID, receiverDocument: '93893857001' },
    ])
    expect(world.saved[0]).toMatchObject({
      id: PROOF_ID,
      receiverDocumentEnvelope: ENVELOPE,
      receiverDocumentMasked: '***.938.570-**',
    })
    expect(JSON.stringify(world.saved[0])).not.toContain('93893857001')
  })

  it('sem documento, nada é selado e as colunas ficam vazias', async () => {
    const world = buildWorld({ receiverDocument: 'optional' })

    await attachDeliveryProof(buildInput(world))

    expect(world.sealed).toHaveLength(0)
    expect(world.saved[0]).toMatchObject({
      receiverDocumentEnvelope: null,
      receiverDocumentMasked: '',
    })
  })
})
