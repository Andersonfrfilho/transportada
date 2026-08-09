/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomUUID } from 'node:crypto'

import type { ObjectStorageProvider } from '@adatechnology/object-storage-provider'
import {
  createObjectStorageProvider,
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'
import { describe, expect, test } from 'bun:test'
import { unzipSync } from 'fflate'

import type { CteArchiveEntry } from '../../src/cte-issuance/application/export-cte-documents.port'
import { createCteArchiveGateway } from '../../src/cte-issuance/infrastructure/cte-archive.gateway'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway'

const XML_CONTENT_TYPE = 'application/xml'
const MAX_OBJECT_SIZE_BYTES = 25 * 1024 * 1024

/** O volumoso passa dos 200 KiB: obriga a leitura em vários chunks vindos da rede. */
const BULKY_REPETITIONS = 4_000

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY
const region = process.env.OBJECT_STORAGE_REGION ?? process.env.STORAGE_REGION ?? 'us-east-1'

const hasObjectStorage = [endpoint, bucket, accessKeyId, secretAccessKey].every(
  (value) => value !== undefined && value.trim() !== '',
)

const testWithObjectStorage = hasObjectStorage ? test : test.skip

/** Só chega aqui com a suíte habilitada; sem storage configurado os casos nem rodam. */
const BUCKET = bucket ?? ''

type SeededObject = {
  readonly entry: CteArchiveEntry
  readonly objectKey: string
  readonly payload: Uint8Array
}

/** Chave sintética: 44 dígitos derivados de um sequencial, nunca uma chave fiscal real. */
function syntheticAccessKey(sequence: number): string {
  return `${'0'.repeat(40)}${String(sequence).padStart(4, '0')}`
}

/** XML sintético, sem dado fiscal: o gateway só move bytes opacos do storage para o ZIP. */
function syntheticXml(input: {
  readonly repetitions: number
  readonly sequence: number
}): Uint8Array {
  const body = `<infCte sequencia="${input.sequence}"><vPrest>0.00</vPrest></infCte>`.repeat(
    input.repetitions,
  )
  return new TextEncoder().encode(`<cteProc>${body}</cteProc>`)
}

function createProvider(): ObjectStorageProvider {
  return createObjectStorageProvider({
    accessKeyId: accessKeyId ?? '',
    endpoint: new URL(endpoint ?? ''),
    forcePathStyle: true,
    healthCheckBucket: BUCKET,
    maxObjectSizeBytes: MAX_OBJECT_SIZE_BYTES,
    region,
    secretAccessKey: secretAccessKey ?? '',
  })
}

async function seedObject(input: {
  readonly prefix: string
  readonly repetitions: number
  readonly sequence: number
  readonly storage: NfeStorageGateway
}): Promise<SeededObject> {
  const payload = syntheticXml({ repetitions: input.repetitions, sequence: input.sequence })
  const accessKey = syntheticAccessKey(input.sequence)
  const objectKey = `${input.prefix}/${accessKey}.xml`

  await input.storage.storeObject({
    body: payload,
    bucket: BUCKET,
    contentLength: payload.byteLength,
    contentType: XML_CONTENT_TYPE,
    key: objectKey,
    sha256: createHash('sha256').update(payload).digest('hex'),
  })

  return {
    entry: { name: `${accessKey}.xml`, source: { bucket: BUCKET, kind: 'object', objectKey } },
    objectKey,
    payload,
  }
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function withSeededObjects(
  run: (input: {
    readonly prefix: string
    readonly storage: NfeStorageGateway
    readonly seed: (sequence: number, repetitions?: number) => Promise<SeededObject>
  }) => Promise<void>,
): Promise<void> {
  const provider = createProvider()
  const storage = createNfeStorageGateway({
    finalBucket: BUCKET,
    provider,
    stagingBucket: BUCKET,
  })
  const prefix = `integration/cte-archive/${randomUUID()}`
  const seededKeys: string[] = []

  try {
    await run({
      prefix,
      seed: async (sequence, repetitions = 1) => {
        const seeded = await seedObject({ prefix, repetitions, sequence, storage })
        seededKeys.push(seeded.objectKey)
        return seeded
      },
      storage,
    })
  } finally {
    for (const key of seededKeys) await provider.delete({ bucket: BUCKET, key })
    await provider.close()
  }
}

describe('cte archive gateway integration', () => {
  testWithObjectStorage(
    'monta o ZIP com os bytes que o object storage devolveu e reabre entrada por entrada',
    async () => {
      await withSeededObjects(async ({ seed, storage }) => {
        const seeded = [
          await seed(1),
          await seed(2, BULKY_REPETITIONS),
          await seed(3),
        ] as const satisfies readonly SeededObject[]
        const gateway = createCteArchiveGateway({ storage })

        const archiveBytes = await collect(
          await gateway.createArchive(seeded.map((object) => object.entry)),
        )
        const archive = unzipSync(archiveBytes)

        expect(Object.keys(archive).sort()).toEqual(
          seeded.map((object) => object.entry.name).sort(),
        )
        for (const object of seeded) {
          const extracted = archive[object.entry.name]
          expect(Buffer.from(extracted ?? new Uint8Array(0)).equals(object.payload)).toBe(true)
        }

        // Modo `store`: o conteúdo do maior objeto aparece literal dentro do ZIP, sem deflate.
        expect(Buffer.from(archiveBytes).includes(Buffer.from(seeded[1].payload))).toBe(true)
      })
    },
  )

  testWithObjectStorage(
    'objeto ausente no bucket derruba o stream em vez de entregar ZIP truncado',
    async () => {
      await withSeededObjects(async ({ prefix, seed, storage }) => {
        const present = await seed(1)
        const missing: CteArchiveEntry = {
          name: `${syntheticAccessKey(9)}.xml`,
          source: {
            bucket: BUCKET,
            kind: 'object',
            objectKey: `${prefix}/${syntheticAccessKey(9)}.xml`,
          },
        }
        const gateway = createCteArchiveGateway({ storage })

        const stream = await gateway.createArchive([present.entry, missing])
        const failure = await collect(stream).then(
          () => undefined,
          (error: unknown) => error,
        )

        expect(failure).toBeInstanceOf(ObjectStorageError)
        expect(failure instanceof ObjectStorageError ? failure.code : undefined).toBe(
          OBJECT_STORAGE_ERROR_CODES.unavailable,
        )
      })
    },
  )
})
