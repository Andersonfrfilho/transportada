/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T201: o upload direto ao storage por URL assinada (RF2/RF2a/RF2b) — sem banco, sem HTTP,
 * sem o SDK de verdade. Os dublês aqui só existem para provar as três barreiras: a emissão valida a
 * forma declarada (tipo, tamanho); a confirmação confere o objeto de verdade (`head()` + bytes,
 * porque o `Content-Type` não entra na assinatura da URL); e a referência só aceita objeto
 * confirmado, desta empresa e desta viagem.
 */
import { describe, expect, test } from 'bun:test'

import {
  confirmOccurrenceUpload,
  type OccurrenceUploadConfirmationPort,
  type OccurrenceUploadConfirmationStoragePort,
  type PendingOccurrenceUpload,
} from '../../src/trips/application/confirm-occurrence-upload.use-case.js'
import {
  createOccurrenceUpload,
  type OccurrenceUploadRequestPort,
  type OccurrenceUploadSigningPort,
} from '../../src/trips/application/create-occurrence-upload.use-case.js'
import { resolveOccurrenceUploadAttachment } from '../../src/trips/application/resolve-occurrence-upload-attachment.use-case.js'
import {
  confirmReachableOccurrenceUpload,
  requestOccurrenceUpload,
} from '../../src/trips/application/request-occurrence-upload.use-case.js'
import { TripDocumentNotReachableError } from '../../src/trips/domain/trip.error.js'
import {
  OCCURRENCE_PDF_MAX_BYTES,
  OCCURRENCE_PHOTO_MAX_BYTES,
} from '../../src/trips/domain/occurrence-attachment.policy.js'
import {
  TripDeliveryProofRejectedError,
  TripOccurrenceUploadNotReachableError,
} from '../../src/trips/domain/trip.error.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TRIP = '00000000-0000-4000-8000-000000000011'
const OTHER_TRIP = '00000000-0000-4000-8000-000000000099'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const OBJECT_ID = '00000000-0000-4000-8000-0000000000c1'
const NOW = new Date('2026-09-23T12:00:00.000Z')

/** Um JPEG de verdade e mínimo (assinatura `FF D8 FF`), pequeno o bastante para caber no teto. */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

describe('emitir a URL assinada de upload (spec 179 T201, RF2/RF2a)', () => {
  function signing(calls: object[] = []): OccurrenceUploadSigningPort {
    return {
      async createSignedUpload(input) {
        calls.push(input)
        return new URL(`https://storage.test/${input.key}`)
      },
    }
  }

  function repository(rows: object[] = []): OccurrenceUploadRequestPort {
    return {
      async insertPendingUpload(input) {
        rows.push(input)
      },
    }
  }

  test('tipo aceito (imagem ou PDF) e tamanho dentro do teto emitem a URL', async () => {
    const calls: object[] = []
    const rows: object[] = []
    const result = await createOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      driverId: DRIVER,
      mimeType: 'image/jpeg',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: repository(rows),
      sizeBytes: 1024,
      storage: signing(calls),
      tripId: TRIP,
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(result.uploadUrl.toString()).toContain(TRIP)
    expect(calls).toHaveLength(1)
    expect(rows).toHaveLength(1)
  })

  test('tipo fora da lista (imagem/PDF) é recusado antes de chamar o storage', async () => {
    const calls: object[] = []
    const rows: object[] = []
    const rejected = await createOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      driverId: DRIVER,
      mimeType: 'application/zip',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: repository(rows),
      sizeBytes: 1024,
      storage: signing(calls),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripDeliveryProofRejectedError)
    expect(calls).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })

  test('tamanho declarado acima do teto da imagem é recusado antes de chamar o storage', async () => {
    const calls: object[] = []
    const rejected = await createOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      driverId: DRIVER,
      mimeType: 'image/jpeg',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: repository(),
      sizeBytes: OCCURRENCE_PHOTO_MAX_BYTES + 1,
      storage: signing(calls),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripDeliveryProofRejectedError)
    expect(calls).toHaveLength(0)
  })

  test('PDF usa o teto maior do PDF, não o da imagem', async () => {
    const result = await createOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      driverId: DRIVER,
      mimeType: 'application/pdf',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: repository(),
      sizeBytes: OCCURRENCE_PHOTO_MAX_BYTES + 1,
      storage: signing(),
      tripId: TRIP,
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(OCCURRENCE_PDF_MAX_BYTES).toBeGreaterThan(OCCURRENCE_PHOTO_MAX_BYTES)
  })
})

describe('confirmar o upload (spec 179 T201, RF2a)', () => {
  type StorageCall =
    | { readonly key: string; readonly kind: 'confirm' }
    | { readonly key: string; readonly kind: 'delete' }
    | { readonly body: Uint8Array; readonly key: string; readonly kind: 'store' }

  function storage(input: {
    readonly bytes?: Uint8Array
    readonly calls?: StorageCall[]
    readonly contentLength?: number
    readonly notFound?: boolean
  }): OccurrenceUploadConfirmationStoragePort {
    return {
      async deleteObject(location) {
        input.calls?.push({ key: location.key, kind: 'delete' })
      },
      async getObjectStream() {
        return new Response(input.bytes ?? JPEG_BYTES).body as ReadableStream<Uint8Array>
      },
      async headObject() {
        if (input.notFound === true) return undefined
        return { contentLength: input.contentLength ?? (input.bytes ?? JPEG_BYTES).byteLength }
      },
      async storeObject(stored) {
        input.calls?.push({ body: stored.body, key: stored.key, kind: 'store' })
        return undefined
      },
    }
  }

  function repository(
    pending: null | Partial<PendingOccurrenceUpload> = {},
    confirmed: object[] = [],
    confirmedUpload: null | { readonly id: string } = null,
    confirmOutcome: { readonly confirmed: boolean } | Error = { confirmed: true },
    calls: StorageCall[] = [],
  ): OccurrenceUploadConfirmationPort {
    return {
      async confirmUpload(input) {
        confirmed.push(input)
        calls.push({ key: input.objectKey, kind: 'confirm' })
        if (confirmOutcome instanceof Error) throw confirmOutcome
        return confirmOutcome
      },
      async findConfirmedUpload() {
        return confirmedUpload
      },
      async findPendingUpload() {
        if (pending === null) return null
        return {
          bucket: 'trip-attachments',
          expiresAt: new Date(NOW.getTime() + 60_000),
          mimeType: 'image/jpeg',
          objectKey: `tenants/${COMPANY}/trip-occurrence-uploads/${TRIP}/${OBJECT_ID}`,
          ...pending,
        }
      },
    }
  }

  /** Prova que o reenvio idempotente não toca o storage: nem `head()`, nem baixar os bytes. */
  function unreachableStorage(): OccurrenceUploadConfirmationStoragePort {
    return {
      async deleteObject() {
        throw new Error('não deveria apagar objeto no reenvio idempotente')
      },
      async getObjectStream() {
        throw new Error('não deveria baixar bytes no reenvio idempotente')
      },
      async headObject() {
        throw new Error('não deveria checar o objeto no reenvio idempotente')
      },
      async storeObject() {
        throw new Error('não deveria gravar objeto no reenvio idempotente')
      },
    }
  }

  const STAGING_KEY = `tenants/${COMPANY}/trip-occurrence-uploads/${TRIP}/${OBJECT_ID}`
  const FINAL_TOKEN = 'token-final-de-teste'

  /**
   * A URL de PUT assinada vale 15 minutos e segue valendo depois da confirmação. Se o registro
   * apontasse para a chave da subida, um PUT tardio do mesmo tamanho trocaria o arquivo já
   * conferido. Os bytes conferidos vão para uma chave final nova, e a da subida sai depois.
   */
  test('grava os bytes conferidos numa chave final nova, aponta o registro para ela e apaga a da subida depois', async () => {
    const calls: StorageCall[] = []
    const confirmed: object[] = []
    await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      newObjectToken: () => FINAL_TOKEN,
      now: NOW,
      repository: repository({}, confirmed, null, { confirmed: true }, calls),
      storage: storage({ bytes: JPEG_BYTES, calls }),
      tripId: TRIP,
    })

    const finalKey = `tenants/${COMPANY}/trip-occurrence-attachments/${TRIP}/${FINAL_TOKEN}`
    expect(calls).toEqual([
      { body: JPEG_BYTES, key: finalKey, kind: 'store' },
      { key: finalKey, kind: 'confirm' },
      { key: STAGING_KEY, kind: 'delete' },
    ])
    expect((confirmed[0] as { objectKey: string }).objectKey).not.toBe(STAGING_KEY)
  })

  test('sem token injetado, a chave final é aleatória e nunca a da subida', async () => {
    const confirmed: object[] = []
    await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({}, confirmed),
      storage: storage({ bytes: JPEG_BYTES }),
      tripId: TRIP,
    })

    const { objectKey } = confirmed[0] as { objectKey: string }
    expect(objectKey).toStartWith(`tenants/${COMPANY}/trip-occurrence-attachments/${TRIP}/`)
    expect(objectKey.split('/').at(-1)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  test('a gravação do registro falha: a cópia final sai do bucket, a da subida fica, o erro sobe', async () => {
    const calls: StorageCall[] = []
    const failure = new Error('banco caiu')
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      newObjectToken: () => FINAL_TOKEN,
      now: NOW,
      repository: repository({}, [], null, failure, calls),
      storage: storage({ bytes: JPEG_BYTES, calls }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    const finalKey = `tenants/${COMPANY}/trip-occurrence-attachments/${TRIP}/${FINAL_TOKEN}`
    expect(rejected).toBe(failure)
    expect(calls.filter((call) => call.kind === 'delete')).toEqual([
      { key: finalKey, kind: 'delete' },
    ])
  })

  test('perde a corrida: a cópia final desta chamada sai do bucket e a da subida fica para a vencedora', async () => {
    const calls: StorageCall[] = []
    await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      newObjectToken: () => FINAL_TOKEN,
      now: NOW,
      repository: repository({}, [], { id: OBJECT_ID }, { confirmed: false }, calls),
      storage: storage({ bytes: JPEG_BYTES, calls }),
      tripId: TRIP,
    })

    const finalKey = `tenants/${COMPANY}/trip-occurrence-attachments/${TRIP}/${FINAL_TOKEN}`
    expect(calls.filter((call) => call.kind === 'delete')).toEqual([
      { key: finalKey, kind: 'delete' },
    ])
  })

  test('bytes recusados: nada é copiado nem apagado', async () => {
    const calls: StorageCall[] = []
    await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({ mimeType: 'image/jpeg' }, [], null, { confirmed: true }, calls),
      storage: storage({ bytes: PDF_BYTES, calls }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(calls).toEqual([])
  })

  test('objeto real batendo com o tipo declarado grava stored_objects com sha256 e tamanho reais', async () => {
    const confirmed: object[] = []
    const result = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({}, confirmed),
      storage: storage({ bytes: JPEG_BYTES }),
      tripId: TRIP,
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(confirmed).toHaveLength(1)
    expect((confirmed[0] as { sizeBytes: number }).sizeBytes).toBe(JPEG_BYTES.byteLength)
    expect((confirmed[0] as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  /**
   * Achado [2] da revisão de 23/09: quando o `UPDATE` condicionado a `status = 'pending'` não afeta
   * nenhuma linha — outra confirmação concorrente já venceu a corrida entre a leitura e a escrita —,
   * o repositório devolve `confirmed: false` em vez de inserir `stored_objects` de novo. O caso de
   * uso recorre ao mesmo recall do achado [1] e devolve o resultado da vencedora, não um 500.
   */
  test('perde a corrida (UPDATE não afetou linha): devolve o resultado da vencedora, sem inserir de novo', async () => {
    const confirmed: object[] = []
    const result = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({}, confirmed, { id: OBJECT_ID }, { confirmed: false }),
      storage: storage({ bytes: JPEG_BYTES }),
      tripId: TRIP,
    })

    expect(result.id).toBe(OBJECT_ID)
  })

  /**
   * ⚠️ O `Content-Type` não entra na assinatura da URL — um upload declarado "imagem" mas com bytes
   * de outra coisa (aqui, PDF) precisa ser recusado pela assinatura real, nunca aceito porque o
   * cliente disse que era imagem.
   */
  test('bytes reais não batem com o tipo declarado: recusado, nada gravado', async () => {
    const confirmed: object[] = []
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({ mimeType: 'image/jpeg' }, confirmed),
      storage: storage({ bytes: PDF_BYTES }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripDeliveryProofRejectedError)
    expect(confirmed).toHaveLength(0)
  })

  test('pedido inexistente, de outra empresa ou de outra viagem é inalcançável', async () => {
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository(null),
      storage: storage({}),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  /**
   * Achado [1] da revisão de 23/09: `findPendingUpload` filtra `status = 'pending'`, e a segunda
   * confirmação (reenvio da fila offline) já não acha nada — sem esta checagem, ela levaria 404 em
   * vez do mesmo resultado da primeira.
   */
  test('reenvio da confirmação já concluída devolve o mesmo resultado, sem tocar o storage', async () => {
    const confirmed: object[] = []
    const result = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository(null, confirmed, { id: OBJECT_ID }),
      storage: unreachableStorage(),
      tripId: TRIP,
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(confirmed).toHaveLength(0)
  })

  test('objeto confirmado só é devolvido a quem é dono: outra empresa/viagem continua 404', async () => {
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      // `findPendingUpload` já escopa por empresa/viagem; `findConfirmedUpload` faz o mesmo no
      // recall — nenhum dos dois acha nada quando o objeto é de outro contexto.
      repository: repository(null, [], null),
      storage: unreachableStorage(),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  test('pedido vencido é inalcançável', async () => {
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({ expiresAt: new Date(NOW.getTime() - 1) }),
      storage: storage({}),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  test('objeto que nunca chegou ao bucket é inalcançável', async () => {
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({}),
      storage: storage({ notFound: true }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  test('tamanho real acima do teto é recusado pelo head(), sem baixar os bytes', async () => {
    const rejected = await confirmOccurrenceUpload({
      companyId: COMPANY,
      id: OBJECT_ID,
      now: NOW,
      repository: repository({}),
      storage: storage({ contentLength: OCCURRENCE_PHOTO_MAX_BYTES + 1 }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })
})

describe('referenciar o objeto na ocorrência (spec 179 T201, RF2b)', () => {
  function repository(
    confirmedFor: null | { readonly companyId: string; readonly tripId: string },
  ) {
    return {
      async findConfirmedUpload(input: { companyId: string; id: string; tripId: string }) {
        if (confirmedFor === null) return null
        if (confirmedFor.companyId !== input.companyId) return null
        if (confirmedFor.tripId !== input.tripId) return null
        return { id: input.id }
      },
    }
  }

  test('objeto confirmado, desta empresa e desta viagem, é aceito', async () => {
    const attachment = await resolveOccurrenceUploadAttachment({
      companyId: COMPANY,
      objectId: OBJECT_ID,
      repository: repository({ companyId: COMPANY, tripId: TRIP }),
      tripId: TRIP,
    })

    expect(attachment.id).toBe(OBJECT_ID)
  })

  test('objeto que não existe (nunca confirmado) é inalcançável', async () => {
    const rejected = await resolveOccurrenceUploadAttachment({
      companyId: COMPANY,
      objectId: OBJECT_ID,
      repository: repository(null),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  /** O objeto é de outra empresa: mesmo id, contexto autenticado diferente. */
  test('objeto de outra empresa é inalcançável', async () => {
    const rejected = await resolveOccurrenceUploadAttachment({
      companyId: COMPANY,
      objectId: OBJECT_ID,
      repository: repository({ companyId: '00000000-0000-4000-8000-000000000002', tripId: TRIP }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  /** O objeto existe e é da empresa certa, mas foi enviado para outra viagem. */
  test('objeto que não veio desta viagem é inalcançável', async () => {
    const rejected = await resolveOccurrenceUploadAttachment({
      companyId: COMPANY,
      objectId: OBJECT_ID,
      repository: repository({ companyId: COMPANY, tripId: OTHER_TRIP }),
      tripId: TRIP,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })
})

/**
 * Spec 179 T202: o pedido (e a confirmação) de upload passam pela mesma barreira de alcance que
 * `register-driver-occurrence.use-case.ts` já usa — nota fora da viagem dele é inalcançável, nunca
 * um objeto solto sem dono.
 */
describe('pedir e confirmar o upload amarrados à nota (spec 179 T202)', () => {
  const DOCUMENT = '00000000-0000-4000-8000-000000000017'

  function reachableRepository(input: {
    readonly confirmed?: object[]
    readonly pending?: object[]
    readonly reachable: boolean
  }) {
    return {
      async confirmUpload(record: object) {
        input.confirmed?.push(record)
        return { confirmed: true }
      },
      async findConfirmedUpload() {
        return null
      },
      async findPendingUpload() {
        return {
          bucket: 'trip-attachments',
          expiresAt: new Date(NOW.getTime() + 60_000),
          mimeType: 'image/jpeg',
          objectKey: `tenants/${COMPANY}/trip-occurrence-uploads/${TRIP}/${OBJECT_ID}`,
        }
      },
      async findReachableDocument() {
        return input.reachable ? { tripId: TRIP } : null
      },
      async insertPendingUpload(record: object) {
        input.pending?.push(record)
      },
    }
  }

  test('nota alcançável: emite a URL escopada pela viagem resolvida', async () => {
    const pending: object[] = []
    const result = await requestOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      mimeType: 'image/jpeg',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: reachableRepository({ pending, reachable: true }),
      sizeBytes: 1024,
      storage: { createSignedUpload: async () => new URL('https://storage.test/upload') },
    })

    expect(result.id).toBe(OBJECT_ID)
    expect(pending).toHaveLength(1)
  })

  test('nota fora da viagem dele: o pedido de upload é inalcançável, nada gravado', async () => {
    const pending: object[] = []
    const rejected = await requestOccurrenceUpload({
      bucket: 'trip-attachments',
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      mimeType: 'image/jpeg',
      newObjectId: () => OBJECT_ID,
      now: NOW,
      repository: reachableRepository({ pending, reachable: false }),
      sizeBytes: 1024,
      storage: { createSignedUpload: async () => new URL('https://storage.test/upload') },
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripDocumentNotReachableError)
    expect(pending).toHaveLength(0)
  })

  test('nota fora da viagem dele: a confirmação também é inalcançável', async () => {
    const confirmed: object[] = []
    const rejected = await confirmReachableOccurrenceUpload({
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      id: OBJECT_ID,
      now: NOW,
      repository: reachableRepository({ confirmed, reachable: false }),
      storage: {
        deleteObject: async () => undefined,
        getObjectStream: async () => new Response(JPEG_BYTES).body as ReadableStream<Uint8Array>,
        headObject: async () => ({ contentLength: JPEG_BYTES.byteLength }),
        storeObject: async () => undefined,
      },
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(TripDocumentNotReachableError)
    expect(confirmed).toHaveLength(0)
  })
})
