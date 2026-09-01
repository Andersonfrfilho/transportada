/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  attachDeliveryProof,
  type DeliveryProofPort,
  type DeliveryProofStoragePort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  buildDeliveryProofObjectKey,
  DELIVERY_PROOF_MAX_BYTES,
} from '../../src/trips/domain/delivery-proof.policy.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const OBJECT_ID = '00000000-0000-4000-8000-000000000006'

type SavedProof = Parameters<DeliveryProofPort['saveProof']>[0]

function buildWorld(input: { readonly eventId?: string | null } = {}) {
  const saved: SavedProof[] = []
  const stored: Array<{ readonly objectKey: string }> = []

  const repository: DeliveryProofPort = {
    findDeliveryEventId: () =>
      Promise.resolve(input.eventId === undefined ? EVENT_ID : input.eventId),
    saveProof: (proof) => {
      saved.push(proof)
      return Promise.resolve({ id: 'proof-1' })
    },
  }
  const storage: DeliveryProofStoragePort = {
    store: (proof) => {
      stored.push({ objectKey: proof.objectKey })
      return Promise.resolve({ sha256: 'a'.repeat(64) })
    },
  }

  return { repository, saved, storage, stored }
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
    repository: world.repository,
    storage: world.storage,
    upload: {
      bytes: new Uint8Array(1024),
      kind: 'photo' as const,
      mimeType: 'image/jpeg',
      receiverName: '',
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

describe('o comprovante da entrega', () => {
  it('sobe para o bucket e fica ligado ao evento de entrega', async () => {
    const world = buildWorld()

    const result = await attachDeliveryProof(buildInput(world))

    expect(result.id).toBe('proof-1')
    expect(world.saved[0]).toMatchObject({ eventId: EVENT_ID, kind: 'photo' })
  })

  /** `security.md` §7: quem lista o bucket não pode aprender quem recebeu o quê pelo caminho. */
  it('a chave do objeto não leva nome de pessoa', async () => {
    const world = buildWorld()

    await attachDeliveryProof(
      buildInput(world, { kind: 'signature', receiverName: 'Maria de Sousa' }),
    )

    expect(world.stored[0]?.objectKey).toBe(
      buildDeliveryProofObjectKey({
        companyId: COMPANY_ID,
        eventId: EVENT_ID,
        objectId: OBJECT_ID,
      }),
    )
    expect(world.stored[0]?.objectKey).not.toContain('Maria')
  })

  it('a assinatura guarda o nome de quem recebeu', async () => {
    const world = buildWorld()

    await attachDeliveryProof(
      buildInput(world, { kind: 'signature', receiverName: 'Maria de Sousa' }),
    )

    expect(world.saved[0]?.receiverName).toBe('Maria de Sousa')
  })

  /** Foto de canhoto não tem quem assine: o nome que viesse junto seria dado pessoal sem função. */
  it('a foto descarta o nome, mesmo se ele vier no formulário', async () => {
    const world = buildWorld()

    await attachDeliveryProof(buildInput(world, { kind: 'photo', receiverName: 'Maria de Sousa' }))

    expect(world.saved[0]?.receiverName).toBe('')
  })

  /**
   * ADR-0045 §7: acima do teto a recusa é explícita **e a entrega continua de pé** — a nota já foi
   * entregue antes de o arquivo existir, e é por isso que o comprovante é rota separada.
   */
  it('recusa o arquivo acima do teto sem tocar no bucket', async () => {
    const world = buildWorld()

    await expectApiError(
      attachDeliveryProof(
        buildInput(world, { bytes: new Uint8Array(DELIVERY_PROOF_MAX_BYTES + 1) }),
      ),
      'TRIP_DELIVERY_PROOF_TOO_LARGE',
    )
    expect(world.stored).toHaveLength(0)
  })

  it('recusa o que não é imagem', async () => {
    const world = buildWorld()

    await expectApiError(
      attachDeliveryProof(buildInput(world, { mimeType: 'application/pdf' })),
      'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE',
    )
    expect(world.stored).toHaveLength(0)
  })

  /** Nota que não tem entrega deste motorista não recebe comprovante de ninguém. */
  it('recusa quando não há entrega deste motorista para a nota', async () => {
    const world = buildWorld({ eventId: null })

    await expectApiError(attachDeliveryProof(buildInput(world)), 'TRIP_DOCUMENT_NOT_REACHABLE')
    expect(world.stored).toHaveLength(0)
  })
})
