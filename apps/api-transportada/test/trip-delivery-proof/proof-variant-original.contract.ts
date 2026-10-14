/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T003 (RF3, RF4, RF6): o cliente declara `variant = 'reduced' | 'original'` e o servidor não
 * confia — confere o tamanho real e o tipo pelos bytes. O `original` grava o objeto e o pedido do worker
 * (outbox) na mesma transação; o `reduced` segue o fluxo de sempre. A resposta e as leituras dizem o
 * estado (`received → processing → ready | processing_failed`).
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  attachDeliveryProof,
  type DeliveryProofPort,
  type DeliveryProofStoragePort,
  type DeliveryProofUpload,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { readDriverDeliveryProofs } from '../../src/trips/application/read-driver-delivery-proof.use-case.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  detectDeliveryProofMimeType,
  PROOF_ORIGINAL_MAX_BYTES,
} from '../../src/trips/domain/delivery-proof.policy.js'
import {
  buildProcessingOutboxValues,
  buildProofInsertValues,
  buildProofUpsertSet,
} from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const OBJECT_ID = '00000000-0000-4000-8000-000000000006'
const PROOF_ID = '00000000-0000-4000-8000-000000000007'
const THUMBNAIL_OBJECT_ID = '00000000-0000-4000-8000-000000000008'
const TRIP_ID = '00000000-0000-4000-8000-000000000009'
const CORRELATION_ID = 'correlation-265'
const MIB = 1024 * 1024

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0] as const
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const WEBP_SIGNATURE = [
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
] as const

function imageBytes(signature: readonly number[], size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(signature)
  return bytes
}

function proofRequest(fields: Record<string, string | File> = {}): Request {
  const form = new FormData()
  form.set(
    'file',
    new File([imageBytes(JPEG_SIGNATURE, 16)], 'canhoto.jpg', { type: 'image/jpeg' }),
  )
  form.set('kind', 'photo')
  for (const [name, value] of Object.entries(fields)) form.set(name, value)

  return new Request('http://api.test/me/trips/current/documents/x/proof', {
    body: form,
    method: 'POST',
  })
}

describe('o campo variant do multipart do /proof (RF3)', () => {
  it('ausente ou vazio vale reduced: o app antigo não manda o campo', async () => {
    expect((await parseDeliveryProofUpload(proofRequest())).variant).toBe('reduced')
    expect((await parseDeliveryProofUpload(proofRequest({ variant: '' }))).variant).toBe('reduced')
  })

  it('reduced e original passam como vieram', async () => {
    expect((await parseDeliveryProofUpload(proofRequest({ variant: 'reduced' }))).variant).toBe(
      'reduced',
    )
    expect((await parseDeliveryProofUpload(proofRequest({ variant: 'original' }))).variant).toBe(
      'original',
    )
  })

  it('valor fora do vocabulário é 400, nunca um padrão adivinhado', async () => {
    for (const variant of ['Original', 'full', 'thumbnail', 'original ']) {
      const error = await parseDeliveryProofUpload(proofRequest({ variant })).catch(
        (cause: unknown) => cause,
      )

      expect(error, variant).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
    }
  })

  it('arquivo no lugar do texto é 400', async () => {
    const error = await parseDeliveryProofUpload(
      proofRequest({ variant: new File([new Uint8Array([1])], 'x.bin') }),
    ).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
  })
})

describe('o tipo pelos bytes (RF3)', () => {
  it('reconhece JPEG, PNG e WebP pela assinatura, e nada além disso', () => {
    expect(detectDeliveryProofMimeType(imageBytes(JPEG_SIGNATURE, 32))).toBe('image/jpeg')
    expect(detectDeliveryProofMimeType(imageBytes(PNG_SIGNATURE, 32))).toBe('image/png')
    expect(detectDeliveryProofMimeType(imageBytes(WEBP_SIGNATURE, 32))).toBe('image/webp')
    expect(detectDeliveryProofMimeType(new Uint8Array(0))).toBeNull()
    expect(detectDeliveryProofMimeType(new Uint8Array(64))).toBeNull()
    expect(detectDeliveryProofMimeType(new TextEncoder().encode('%PDF-1.7 ...'))).toBeNull()
    expect(
      detectDeliveryProofMimeType(
        new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
      ),
    ).toBeNull()
  })
})

function buildWorld(
  options: {
    readonly existing?: Awaited<ReturnType<DeliveryProofPort['findProofIdByAttachmentKey']>>
  } = {},
) {
  const saved: Parameters<DeliveryProofPort['saveProof']>[0][] = []
  const stored: { readonly mimeType: string; readonly objectId: string; readonly size: number }[] =
    []
  const logs: {
    readonly level: string
    readonly message: string
    readonly metadata: Record<string, unknown>
  }[] = []
  const repository: DeliveryProofPort = {
    countProofsForEvent: () => Promise.resolve(0),
    findDeliveryContext: () =>
      Promise.resolve({
        deliveredAt: new Date('2026-10-14T12:00:00.000Z'),
        deliveryEventPosition: undefined,
        isDeliveryRecordedByDriver: true,
      }),
    findDeliveryEventId: () => Promise.resolve(EVENT_ID),
    findProofIdByAttachmentKey: () => Promise.resolve(options.existing ?? null),
    findProofPunctuality: () => Promise.resolve(null),
    resolveProofFieldSettings: () => Promise.resolve(DEFAULT_DELIVERY_PROOF_SETTINGS),
    resolveProofPunctualitySettings: () =>
      Promise.resolve(DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS),
    saveProof: (proof) => {
      saved.push(proof)
      return Promise.resolve({ id: proof.id })
    },
  }
  const storage: DeliveryProofStoragePort = {
    store: (object) => {
      stored.push({
        mimeType: object.mimeType,
        objectId: object.objectId,
        size: object.bytes.byteLength,
      })
      return Promise.resolve({ sha256: 'a'.repeat(64) })
    },
  }
  const logger = {
    error: (message: string, metadata: Record<string, unknown> = {}) =>
      logs.push({ level: 'error', message, metadata }),
    info: (message: string, metadata: Record<string, unknown> = {}) =>
      logs.push({ level: 'info', message, metadata }),
    warn: (message: string, metadata: Record<string, unknown> = {}) =>
      logs.push({ level: 'warn', message, metadata }),
  }

  return { logger, logs, repository, saved, storage, stored }
}

function upload(overrides: Partial<DeliveryProofUpload> = {}): DeliveryProofUpload {
  return {
    attachmentKey: 'attachment-265',
    bytes: imageBytes(JPEG_SIGNATURE, 3 * MIB),
    capturedAt: undefined,
    kind: 'photo',
    mimeType: 'image/jpeg',
    position: undefined,
    receiverDocument: '',
    receiverName: '',
    variant: 'original',
    ...overrides,
  }
}

function run(world: ReturnType<typeof buildWorld>, input: DeliveryProofUpload) {
  const objectIds = [OBJECT_ID, THUMBNAIL_OBJECT_ID]

  return attachDeliveryProof({
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    correlationId: CORRELATION_ID,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    logger: world.logger,
    newObjectId: () => objectIds.shift() ?? 'exhausted',
    newProofId: () => PROOF_ID,
    now: new Date('2026-10-14T12:05:00.000Z'),
    repository: world.repository,
    sealDocument: () => Promise.reject(new Error('NOT_EXPECTED')),
    storage: world.storage,
    upload: input,
  })
}

describe('variant = original grava o objeto e o pedido do worker (RF4)', () => {
  it('guarda o original inteiro, entrega o pedido ao repositório e responde "received"', async () => {
    const world = buildWorld()

    const result = await run(world, upload())

    expect(result).toMatchObject({ id: PROOF_ID, processingState: 'received' })
    expect(world.stored).toEqual([{ mimeType: 'image/jpeg', objectId: OBJECT_ID, size: 3 * MIB }])
    expect(world.saved).toHaveLength(1)
    const [saved] = world.saved
    expect(saved?.sizeBytes).toBe(3 * MIB)
    expect(saved?.objectId).toBe(OBJECT_ID)
    expect(saved?.processing).toEqual({
      correlationId: CORRELATION_ID,
      originalObjectId: OBJECT_ID,
      variant: 'original',
    })
  })

  it('o tipo vem dos bytes, não do cabeçalho: PNG declarado como JPEG grava image/png', async () => {
    const world = buildWorld()

    await run(world, upload({ bytes: imageBytes(PNG_SIGNATURE, 2 * MIB), mimeType: 'image/jpeg' }))

    expect(world.stored[0]?.mimeType).toBe('image/png')
    expect(world.saved[0]?.mimeType).toBe('image/png')
  })

  it('o cabeçalho ausente ou mentiroso não derruba o original que é imagem de verdade', async () => {
    const world = buildWorld()

    await run(world, upload({ mimeType: 'application/octet-stream' }))

    expect(world.saved[0]?.mimeType).toBe('image/jpeg')
  })

  it('bytes que não são imagem voltam UNSUPPORTED_TYPE, mesmo declarados como JPEG', async () => {
    const world = buildWorld()

    for (const bytes of [
      new Uint8Array(0),
      new Uint8Array(2 * MIB),
      new TextEncoder().encode('%PDF-1.7'),
    ]) {
      const error = await run(world, upload({ bytes })).catch((cause: unknown) => cause)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE')
    }
    expect(world.stored).toEqual([])
    expect(world.saved).toEqual([])
  })

  it('acima de 12 MiB volta TOO_LARGE e nada é guardado', async () => {
    const world = buildWorld()

    const error = await run(
      world,
      upload({ bytes: imageBytes(JPEG_SIGNATURE, PROOF_ORIGINAL_MAX_BYTES + 1) }),
    ).catch((cause: unknown) => cause)

    expect((error as ApiError).code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect(world.stored).toEqual([])
    expect(world.saved).toEqual([])
  })

  it('exatamente 12 MiB é aceito', async () => {
    const world = buildWorld()

    const result = await run(
      world,
      upload({ bytes: imageBytes(JPEG_SIGNATURE, PROOF_ORIGINAL_MAX_BYTES) }),
    )

    expect(result.processingState).toBe('received')
  })

  it('a miniatura que acompanha o original continua valendo, com o teto de sempre', async () => {
    const world = buildWorld()

    await run(
      world,
      upload({ thumbnail: { bytes: imageBytes(JPEG_SIGNATURE, 4096), mimeType: 'image/jpeg' } }),
    )

    expect(world.saved[0]?.thumbnail?.objectId).toBe(THUMBNAIL_OBJECT_ID)
    expect(world.stored).toHaveLength(2)
  })

  it('reenvio com a mesma chave devolve o estado atual e não regrava nada (RF7)', async () => {
    const world = buildWorld({
      existing: { id: PROOF_ID, processingState: 'processing', punctuality: 'on_time' },
    })

    const result = await run(world, upload())

    expect(result).toMatchObject({ id: PROOF_ID, processingState: 'processing' })
    expect(world.stored).toEqual([])
    expect(world.saved).toEqual([])
  })
})

describe('variant = reduced segue o fluxo de sempre (RF4)', () => {
  it('sem pedido ao worker e com o estado "ready"', async () => {
    const world = buildWorld()

    const result = await run(
      world,
      upload({ bytes: imageBytes(JPEG_SIGNATURE, 900 * 1024), variant: 'reduced' }),
    )

    expect(result.processingState).toBe('ready')
    expect(world.saved[0]?.processing).toBeUndefined()
  })

  it('upload sem o campo (escritório, app antigo) é reduced', async () => {
    const world = buildWorld()
    const legacy = { ...upload({ bytes: imageBytes(JPEG_SIGNATURE, 1024) }) } as Record<
      string,
      unknown
    >
    delete legacy.variant

    const result = await run(world, legacy as ReturnType<typeof upload>)

    expect(result.processingState).toBe('ready')
    expect(world.saved[0]?.processing).toBeUndefined()
  })

  it('mantém o teto de 960 KiB e o tipo declarado, como antes da 265', async () => {
    const world = buildWorld()

    const tooLarge = await run(
      world,
      upload({ bytes: imageBytes(JPEG_SIGNATURE, 961 * 1024), variant: 'reduced' }),
    ).catch((cause: unknown) => cause)
    const unsupported = await run(
      world,
      upload({ bytes: new Uint8Array(1024), mimeType: 'application/pdf', variant: 'reduced' }),
    ).catch((cause: unknown) => cause)

    expect((tooLarge as ApiError).code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect((unsupported as ApiError).code).toBe('TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE')
  })
})

describe('o log delivery_proof_processing (RF13)', () => {
  it('o original recebido loga variant, bytes, duração, resultado e o proofId', async () => {
    const world = buildWorld()

    await run(world, upload())

    const entry = world.logs.find((log) => log.message === 'delivery_proof_processing')
    expect(entry?.level).toBe('info')
    expect(entry?.metadata).toMatchObject({
      attachmentKey: 'attachment-265',
      bytes: 3 * MIB,
      companyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
      kind: 'photo',
      outcome: 'received',
      proofId: PROOF_ID,
      variant: 'original',
    })
    expect(typeof entry?.metadata.durationMs).toBe('number')
    expect(entry?.metadata.durationMs as number).toBeGreaterThanOrEqual(0)
  })

  it('o reduced aceito loga outcome "stored"', async () => {
    const world = buildWorld()

    await run(world, upload({ bytes: imageBytes(JPEG_SIGNATURE, 1024), variant: 'reduced' }))

    const entry = world.logs.find((log) => log.message === 'delivery_proof_processing')
    expect(entry?.metadata).toMatchObject({
      outcome: 'stored',
      proofId: PROOF_ID,
      variant: 'reduced',
    })
  })

  it('o reenvio idempotente loga "replayed" com o proofId que já existia', async () => {
    const world = buildWorld({
      existing: { id: PROOF_ID, processingState: 'ready', punctuality: 'on_time' },
    })

    await run(world, upload())

    const entry = world.logs.find((log) => log.message === 'delivery_proof_processing')
    expect(entry?.metadata).toMatchObject({ outcome: 'replayed', proofId: PROOF_ID })
  })

  it('a recusa loga warn com o motivo, a nota e a chave — e não loga bytes', async () => {
    const world = buildWorld()

    await run(world, upload({ bytes: new Uint8Array(2 * MIB) })).catch(() => undefined)

    const entry = world.logs.find((log) => log.message === 'delivery_proof_processing')
    expect(entry?.level).toBe('warn')
    expect(entry?.metadata).toMatchObject({
      attachmentKey: 'attachment-265',
      bytes: 2 * MIB,
      documentId: DOCUMENT_ID,
      outcome: 'rejected',
      reason: 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE',
      variant: 'original',
    })
    expect(entry?.metadata).not.toHaveProperty('proofId')
    expect(JSON.stringify(entry?.metadata)).not.toMatch(/receiver|exif|latitude|longitude/iu)
  })
})

const SAVE_INPUT = {
  accuracyMeters: null,
  actorUserId: ACTOR_USER_ID,
  attachmentKey: 'attachment-265',
  authorship: { channel: 'driver_app', onBehalfOfDriverId: null },
  capturedAt: null,
  companyId: COMPANY_ID,
  eventId: EVENT_ID,
  id: PROOF_ID,
  kind: 'photo',
  lateRegistration: false,
  latitude: null,
  longitude: null,
  mimeType: 'image/jpeg',
  objectId: OBJECT_ID,
  objectKey: `tenants/${COMPANY_ID}/delivery-proofs/${EVENT_ID}/${OBJECT_ID}`,
  punctuality: 'not_required',
  receivedBy: null,
  receivedByDetail: null,
  receiverDocumentEnvelope: null,
  receiverDocumentMasked: '',
  receiverName: '',
  sha256: 'a'.repeat(64),
  sizeBytes: 3 * MIB,
} as const satisfies Parameters<typeof buildProofInsertValues>[0]

const PROCESSING = {
  correlationId: CORRELATION_ID,
  originalObjectId: OBJECT_ID,
  variant: 'original',
} as const

describe('o que a linha do comprovante e o outbox gravam (RF4, RF6)', () => {
  it('o original nasce "received" apontando para o objeto original; o erro nasce vazio', () => {
    const values = buildProofInsertValues({
      ...SAVE_INPUT,
      processing: PROCESSING,
    })

    expect(values.processingState).toBe('received')
    expect(values.originalObjectId).toBe(OBJECT_ID)
    expect(values.processingError).toBeNull()
  })

  it('o reduced nasce sem estado, sem original e sem erro: a coluna fica nula', () => {
    const values = buildProofInsertValues(SAVE_INPUT)

    expect(values.processingState).toBeNull()
    expect(values.originalObjectId).toBeNull()
    expect(values.processingError).toBeNull()
  })

  it('a recaptura zera o estado: reduced por cima de um original limpa os três', () => {
    const set = buildProofUpsertSet(SAVE_INPUT)

    expect(set.processingState).toBeNull()
    expect(set.originalObjectId).toBeNull()
    expect(set.processingError).toBeNull()
  })

  it('a recaptura original por cima de outra volta a "received" com o objeto novo', () => {
    const set = buildProofUpsertSet({
      ...SAVE_INPUT,
      processing: PROCESSING,
    })

    expect(set.processingState).toBe('received')
    expect(set.originalObjectId).toBe(OBJECT_ID)
    expect(set.processingError).toBeNull()
  })

  it('o evento do outbox carrega referência — nunca bytes — e a chave do anexo (RF7)', () => {
    const outbox = buildProcessingOutboxValues({
      input: SAVE_INPUT,
      processing: PROCESSING,
      proofId: PROOF_ID,
    })

    expect(outbox).toEqual({
      companyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
      eventType: 'delivery-proof.processing.requested',
      payload: {
        attachmentKey: 'attachment-265',
        companyId: COMPANY_ID,
        objectKey: SAVE_INPUT.objectKey,
        proofId: PROOF_ID,
        variant: 'original',
      },
      proofId: PROOF_ID,
    })
  })

  it('o proofId do evento é o da linha que ficou, não o gerado: o upsert pode manter o id antigo', () => {
    const outbox = buildProcessingOutboxValues({
      input: SAVE_INPUT,
      processing: PROCESSING,
      proofId: TRIP_ID,
    })

    expect(outbox.proofId).toBe(TRIP_ID)
    expect(outbox.payload.proofId).toBe(TRIP_ID)
  })
})

describe('a leitura expõe processingState (RF6)', () => {
  const RECORD = {
    bucket: 'canhotos',
    createdAt: '2026-10-14T12:00:00.000Z',
    id: PROOF_ID,
    kind: 'photo',
    lateRegistration: false,
    mimeType: 'image/jpeg',
    objectKey: 'tenants/empresa/delivery-proofs/evento/objeto',
    receivedBy: null,
    receivedByDetail: null,
    receiverDocumentMasked: '',
    receiverName: '',
  } as const
  const downloads = {
    createDownloadUrl: (input: { readonly objectKey: string }) =>
      Promise.resolve({
        expiresAt: '2026-10-14T12:05:00.000Z',
        url: `https://bucket.test/${input.objectKey}?assinatura`,
      }),
  }

  function driverRead(processingState: string | null | undefined) {
    return readDriverDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads,
      driverId: DRIVER_ID,
      repository: {
        findReachableDocument: () => Promise.resolve({ tripId: TRIP_ID }),
        listDeliveryProofs: () =>
          Promise.resolve([
            { ...RECORD, ...(processingState === undefined ? {} : { processingState }) },
          ] as never),
      },
    })
  }

  function officeRead(processingState: string | null | undefined) {
    return readDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads,
      repository: {
        listDeliveryProofs: () =>
          Promise.resolve([
            { ...RECORD, ...(processingState === undefined ? {} : { processingState }) },
          ] as never),
      },
      tripId: TRIP_ID,
    })
  }

  it('a leitura do motorista diz sempre o estado; o histórico (nulo ou ausente) é "ready"', async () => {
    expect((await driverRead(undefined))[0]?.processingState).toBe('ready')
    expect((await driverRead(null))[0]?.processingState).toBe('ready')
    expect((await driverRead('received'))[0]?.processingState).toBe('received')
    expect((await driverRead('processing'))[0]?.processingState).toBe('processing')
    expect((await driverRead('ready'))[0]?.processingState).toBe('ready')
    expect((await driverRead('processing_failed'))[0]?.processingState).toBe('processing_failed')
  })

  it('o painel só vê a chave quando há o que dizer: o painel publicado recusa chave que não conhece', async () => {
    for (const quiet of [undefined, null, 'ready']) {
      expect((await officeRead(quiet))[0], String(quiet)).not.toHaveProperty('processingState')
    }
    expect((await officeRead('received'))[0]?.processingState).toBe('received')
    expect((await officeRead('processing'))[0]?.processingState).toBe('processing')
    expect((await officeRead('processing_failed'))[0]?.processingState).toBe('processing_failed')
  })
})

describe('o resto da linha do tempo não vaza para a fila (RNF2)', () => {
  it('o payload do evento tem exatamente as cinco chaves de referência', () => {
    const outbox = buildProcessingOutboxValues({
      input: SAVE_INPUT,
      processing: PROCESSING,
      proofId: PROOF_ID,
    })

    expect(Object.keys(outbox.payload).toSorted()).toEqual([
      'attachmentKey',
      'companyId',
      'objectKey',
      'proofId',
      'variant',
    ])
  })
})
