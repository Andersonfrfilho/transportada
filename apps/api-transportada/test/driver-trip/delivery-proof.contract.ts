/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  attachDeliveryProof,
  type DeliveryProofPort,
  type DeliveryProofStoragePort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import type { Coordinate } from '../../src/addresses/domain/coordinate-distance.js'
import {
  PROOF_PUNCTUALITY,
  type ProofPunctuality,
} from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'
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
const DELIVERED_AT = new Date('2026-09-18T12:00:00.000Z')

type SavedProof = Parameters<DeliveryProofPort['saveProof']>[0]

function buildWorld(
  input: {
    readonly deliveredAt?: Date
    readonly deliveryEventPosition?: Coordinate
    readonly eventId?: string | null
    readonly existingProofByKey?: Readonly<Record<string, ProofPunctuality>>
  } = {},
) {
  const saved: SavedProof[] = []
  const stored: Array<{ readonly objectKey: string }> = []

  const repository: DeliveryProofPort = {
    findDeliveryContext: () =>
      Promise.resolve({
        deliveredAt: input.deliveredAt ?? DELIVERED_AT,
        deliveryEventPosition: input.deliveryEventPosition,
      }),
    findDeliveryEventId: () =>
      Promise.resolve(input.eventId === undefined ? EVENT_ID : input.eventId),
    findProofIdByAttachmentKey: (query) => {
      const punctuality = input.existingProofByKey?.[query.attachmentKey]
      return Promise.resolve(
        punctuality === undefined ? null : { id: 'proof-existing', punctuality },
      )
    },
    /** O padrão de fábrica (ADR-0057 §4): o documento fica de fora destes casos, de propósito. */
    resolveProofFieldSettings: () =>
      Promise.resolve({
        photo: 'optional' as const,
        receiverDocument: 'off' as const,
        receiverName: 'optional' as const,
        signature: 'optional' as const,
      }),
    resolveProofPunctualitySettings: () =>
      Promise.resolve(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS),
    /** O dublê guarda a última pontualidade por evento+tipo, como o upsert do banco. */
    findProofPunctuality: (query) =>
      Promise.resolve(
        saved.findLast((proof) => proof.eventId === query.eventId && proof.kind === query.kind)
          ?.punctuality ?? null,
      ),
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
  now: Date = DELIVERED_AT,
) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    newObjectId: () => OBJECT_ID,
    newProofId: () => 'proof-1',
    now,
    repository: world.repository,
    sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
    storage: world.storage,
    upload: {
      attachmentKey: '',
      bytes: new Uint8Array(1024),
      capturedAt: undefined,
      kind: 'photo' as const,
      mimeType: 'image/jpeg',
      position: undefined,
      receiverDocument: '',
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

  /**
   * Spec 082 (revisão, item 5) + spec 159 (casos extremos): reenvio com a mesma chave converge sem
   * duplicar nem regravar, e a pontualidade já gravada não é recalculada.
   */
  it('reenvio com a mesma attachmentKey devolve o comprovante existente sem tocar no bucket, nem reclassificar', async () => {
    const world = buildWorld({
      existingProofByKey: { 'retry-1': PROOF_PUNCTUALITY.late },
    })

    const result = await attachDeliveryProof(buildInput(world, { attachmentKey: 'retry-1' }))

    expect(result).toEqual({ id: 'proof-existing', punctuality: PROOF_PUNCTUALITY.late })
    expect(world.stored).toHaveLength(0)
    expect(world.saved).toHaveLength(0)
  })

  it('a attachmentKey inédita grava e viaja até a persistência', async () => {
    const world = buildWorld()

    const result = await attachDeliveryProof(buildInput(world, { attachmentKey: 'retry-2' }))

    expect(result.id).toBe('proof-1')
    expect(world.saved[0]).toMatchObject({ attachmentKey: 'retry-2' })
  })

  /** Nota que não tem entrega deste motorista não recebe comprovante de ninguém. */
  it('recusa quando não há entrega deste motorista para a nota', async () => {
    const world = buildWorld({ eventId: null })

    await expectApiError(attachDeliveryProof(buildInput(world)), 'TRIP_DOCUMENT_NOT_REACHABLE')
    expect(world.stored).toHaveLength(0)
  })

  /**
   * Spec 159, aceite 3-4 (ADR-0070 §2-4): a pontualidade da foto é gravada e viaja na resposta. Os
   * casos completos de `classifyProofPunctuality` já estão em
   * `test/trip-delivery-proof/punctuality.contract.ts` (T2) — aqui só se prova que o caso de uso
   * junta as peças certas (settings da nota, contexto do evento, `capturedAt`/posição do upload).
   */
  describe('pontualidade da foto (spec 159 RF4-RF6)', () => {
    async function withPhotoMode(
      world: ReturnType<typeof buildWorld>,
      photoMode: 'off' | 'optional' | 'required',
    ) {
      world.repository.resolveProofFieldSettings = () =>
        Promise.resolve({
          photo: photoMode,
          receiverDocument: 'off' as const,
          receiverName: 'optional' as const,
          signature: 'optional' as const,
        })
    }

    it('foto no local e dentro da janela é on_time (aceite 3)', async () => {
      const deliveryEventPosition: Coordinate = {
        latitude: '-23.5500000',
        longitude: '-46.6300000',
      }
      const world = buildWorld({
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition,
      })
      await withPhotoMode(world, 'required')

      const result = await attachDeliveryProof(
        buildInput(world, {
          capturedAt: new Date(DELIVERED_AT.getTime() + 10 * 60 * 1000),
          position: { ...deliveryEventPosition, accuracyMeters: 5 },
        }),
      )

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
      expect(world.saved[0]).toMatchObject({ punctuality: PROOF_PUNCTUALITY.onTime })
    })

    it('foto 2h depois da janela de 60min é late (aceite 4)', async () => {
      const deliveryEventPosition: Coordinate = {
        latitude: '-23.5500000',
        longitude: '-46.6300000',
      }
      const world = buildWorld({ deliveredAt: DELIVERED_AT, deliveryEventPosition })
      await withPhotoMode(world, 'required')
      const capturedAt = new Date(DELIVERED_AT.getTime() + 2 * 60 * 60 * 1000)

      const result = await attachDeliveryProof(
        buildInput(world, { capturedAt, position: deliveryEventPosition }, capturedAt),
      )

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.late)
    })

    it('foto sem posição é away, mesmo dentro da janela (aceite 4)', async () => {
      const world = buildWorld({
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition: { latitude: '-23.5500000', longitude: '-46.6300000' },
      })
      await withPhotoMode(world, 'required')

      const result = await attachDeliveryProof(
        buildInput(world, {
          capturedAt: new Date(DELIVERED_AT.getTime() + 10 * 60 * 1000),
          position: undefined,
        }),
      )

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.away)
    })

    it('assinatura grava not_required, mesmo com photo = required', async () => {
      const world = buildWorld({ deliveredAt: DELIVERED_AT })
      await withPhotoMode(world, 'required')

      const result = await attachDeliveryProof(buildInput(world, { kind: 'signature' }))

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.notRequired)
    })

    /**
     * Spec 159 T11 (D3b): a substituta nunca melhora a pontualidade — a pontual depois da tardia
     * continua `late`, senão bastava tirar outra foto no lugar certo para apagar o atraso.
     */
    it('foto pontual que substitui a tardia continua late', async () => {
      const deliveryEventPosition: Coordinate = {
        latitude: '-23.5500000',
        longitude: '-46.6300000',
      }
      const world = buildWorld({ deliveredAt: DELIVERED_AT, deliveryEventPosition })
      await withPhotoMode(world, 'required')
      const lateCapturedAt = new Date(DELIVERED_AT.getTime() + 2 * 60 * 60 * 1000)

      await attachDeliveryProof(
        buildInput(
          world,
          { attachmentKey: 'first', capturedAt: lateCapturedAt, position: undefined },
          lateCapturedAt,
        ),
      )
      const second = await attachDeliveryProof(
        buildInput(
          world,
          { attachmentKey: 'second', capturedAt: lateCapturedAt, position: deliveryEventPosition },
          lateCapturedAt,
        ),
      )
      const onTimeAfterAway = await attachDeliveryProof(
        buildInput(world, {
          attachmentKey: 'third',
          capturedAt: new Date(DELIVERED_AT.getTime() + 10 * 60 * 1000),
          position: deliveryEventPosition,
        }),
      )

      expect(world.saved.map((proof) => proof.punctuality)).toEqual([
        PROOF_PUNCTUALITY.lateAndAway,
        PROOF_PUNCTUALITY.lateAndAway,
        PROOF_PUNCTUALITY.lateAndAway,
      ])
      expect(second.punctuality).toBe(PROOF_PUNCTUALITY.lateAndAway)
      expect(onTimeAfterAway.punctuality).toBe(PROOF_PUNCTUALITY.lateAndAway)
    })

    it('foto substituída (upsert por evento+tipo) fica com a pior pontualidade', async () => {
      const deliveryEventPosition: Coordinate = {
        latitude: '-23.5500000',
        longitude: '-46.6300000',
      }
      const world = buildWorld({ deliveredAt: DELIVERED_AT, deliveryEventPosition })
      await withPhotoMode(world, 'required')

      await attachDeliveryProof(
        buildInput(world, {
          attachmentKey: 'first',
          capturedAt: new Date(DELIVERED_AT.getTime() + 10 * 60 * 1000),
          position: deliveryEventPosition,
        }),
      )
      const lateCapturedAt = new Date(DELIVERED_AT.getTime() + 2 * 60 * 60 * 1000)
      const second = await attachDeliveryProof(
        buildInput(
          world,
          { attachmentKey: 'second', capturedAt: lateCapturedAt, position: deliveryEventPosition },
          lateCapturedAt,
        ),
      )

      expect(world.saved).toHaveLength(2)
      expect(second.punctuality).toBe(PROOF_PUNCTUALITY.late)
    })
  })
})
