/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCanhotoImageReader } from '../../src/canhoto-read/application/canhoto-image-reader.service.js'
import type { CanhotoBarcodeDecoderPort } from '../../src/canhoto-read/application/canhoto-barcode-decoder.port.js'
import { CanhotoDecodeTimeoutError } from '../../src/canhoto-read/application/canhoto-decode-timeout.error.js'
import type { PendingCanhotoProof } from '../../src/canhoto-read/application/canhoto-read-queue.port.js'
import { CANHOTO_READ_MAX_OBJECT_BYTES } from '../../src/canhoto-read/domain/canhoto-read.constant.js'
import { createThreadedCanhotoBarcodeDecoder } from '../../src/canhoto-read/infrastructure/threaded-canhoto-barcode.decoder.js'
import {
  buildCanhotoPhoto,
  CANHOTO_PHOTO_ACCESS_KEY,
  REALISTIC_CAMERA_PHOTO,
} from '../fixtures/canhoto-photo.fixture.js'

const THREAD_TEST_TIMEOUT_MILLISECONDS = 60_000
const SMALL_PHOTO = { heightPixels: 1200, moduleWidthPixels: 3, widthPixels: 2400 } as const

describe('threaded canhoto barcode decoder', () => {
  test(
    'reads the exact 44-character key from a realistic 12 MP camera JPEG',
    async () => {
      const bytes = await buildCanhotoPhoto(REALISTIC_CAMERA_PHOTO)
      const decoder = createThreadedCanhotoBarcodeDecoder()

      const text = await decoder.decode({ bytes, mediaType: 'image/jpeg' })

      expect(text).toBe(CANHOTO_PHOTO_ACCESS_KEY)
    },
    THREAD_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'reads the same key from PNG and WebP',
    async () => {
      const decoder = createThreadedCanhotoBarcodeDecoder()
      const png = await buildCanhotoPhoto({ ...SMALL_PHOTO, format: 'png', hasBarcode: true })
      const webp = await buildCanhotoPhoto({ ...SMALL_PHOTO, format: 'webp', hasBarcode: true })

      expect(await decoder.decode({ bytes: png, mediaType: 'image/png' })).toBe(
        CANHOTO_PHOTO_ACCESS_KEY,
      )
      expect(await decoder.decode({ bytes: webp, mediaType: 'image/webp' })).toBe(
        CANHOTO_PHOTO_ACCESS_KEY,
      )
    },
    THREAD_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'answers null, not an error, for a photo with no barcode',
    async () => {
      const bytes = await buildCanhotoPhoto({ ...SMALL_PHOTO, format: 'jpeg', hasBarcode: false })

      const text = await createThreadedCanhotoBarcodeDecoder().decode({
        bytes,
        mediaType: 'image/jpeg',
      })

      expect(text).toBeNull()
    },
    THREAD_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'answers null for bytes that are not a decodable image',
    async () => {
      const bytes = new Uint8Array(2048).fill(7)

      const text = await createThreadedCanhotoBarcodeDecoder().decode({
        bytes,
        mediaType: 'image/jpeg',
      })

      expect(text).toBeNull()
    },
    THREAD_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'terminates the thread and rejects with the timeout error when the budget is exhausted',
    async () => {
      const bytes = await buildCanhotoPhoto(REALISTIC_CAMERA_PHOTO)
      const decoder = createThreadedCanhotoBarcodeDecoder({ budgetMilliseconds: 1 })

      await expect(decoder.decode({ bytes, mediaType: 'image/jpeg' })).rejects.toBeInstanceOf(
        CanhotoDecodeTimeoutError,
      )
    },
    THREAD_TEST_TIMEOUT_MILLISECONDS,
  )
})

const PROOF: PendingCanhotoProof = {
  bucket: 'bucket',
  companyId: 'company-1',
  documentId: 'document-1',
  mimeType: 'image/jpeg',
  objectKey: 'key',
  proofId: 'proof-1',
  sizeBytes: 1024,
  tripId: 'trip-1',
}

type Spies = { downloads: number; decodes: number }

function buildReader(input: {
  readonly decode?: CanhotoBarcodeDecoderPort['decode']
  readonly object?: Uint8Array | undefined
}) {
  const spies: Spies = { decodes: 0, downloads: 0 }
  const reader = createCanhotoImageReader({
    decoder: {
      decode: async (params) => {
        spies.decodes += 1
        return input.decode ? input.decode(params) : 'decoded'
      },
    },
    objectReader: {
      read: async () => {
        spies.downloads += 1
        return 'object' in input ? input.object : new Uint8Array([1])
      },
    },
  })
  return { reader, spies }
}

describe('canhoto image reader', () => {
  test('refuses an object above the cap before downloading it', async () => {
    const { reader, spies } = buildReader({})

    const result = await reader.read({
      ...PROOF,
      sizeBytes: CANHOTO_READ_MAX_OBJECT_BYTES + 1,
    })

    expect(result).toEqual({ kind: 'failed', outcome: 'too_large' })
    expect(spies).toEqual({ decodes: 0, downloads: 0 })
  })

  test('accepts an object of exactly the cap', async () => {
    const { reader, spies } = buildReader({})

    const result = await reader.read({ ...PROOF, sizeBytes: CANHOTO_READ_MAX_OBJECT_BYTES })

    expect(result).toEqual({ kind: 'read', text: 'decoded' })
    expect(spies).toEqual({ decodes: 1, downloads: 1 })
  })

  test('refuses a media type the decoder cannot read before downloading it', async () => {
    const { reader, spies } = buildReader({})

    const result = await reader.read({ ...PROOF, mimeType: 'application/pdf' })

    expect(result).toEqual({ kind: 'failed', outcome: 'unsupported_media' })
    expect(spies).toEqual({ decodes: 0, downloads: 0 })
  })

  test('reports object_unavailable when the storage no longer has the object', async () => {
    const { reader, spies } = buildReader({ object: undefined })

    const result = await reader.read(PROOF)

    expect(result).toEqual({ kind: 'failed', outcome: 'object_unavailable' })
    expect(spies).toEqual({ decodes: 0, downloads: 1 })
  })

  test('reports decode_timeout when the decoder thread exceeds its budget', async () => {
    const { reader } = buildReader({
      decode: async () => {
        throw new CanhotoDecodeTimeoutError()
      },
    })

    expect(await reader.read(PROOF)).toEqual({ kind: 'failed', outcome: 'decode_timeout' })
  })

  test('returns the decoded text, and null when the photo held no code', async () => {
    const withCode = buildReader({ decode: async () => CANHOTO_PHOTO_ACCESS_KEY })
    const withoutCode = buildReader({ decode: async () => null })

    expect(await withCode.reader.read(PROOF)).toEqual({
      kind: 'read',
      text: CANHOTO_PHOTO_ACCESS_KEY,
    })
    expect(await withoutCode.reader.read(PROOF)).toEqual({ kind: 'read', text: null })
  })

  test('lets an unexpected decoder error propagate instead of disguising it as a read', async () => {
    const { reader } = buildReader({
      decode: async () => {
        throw new Error('wasm exploded')
      },
    })

    await expect(reader.read(PROOF)).rejects.toThrow('wasm exploded')
  })
})
