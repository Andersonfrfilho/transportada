/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T006 / RF5 / RNF1 / RNF2: o original grande vira versão ≤ 960 KiB + miniatura + leitura do
 * código de barras, sem EXIF, e o que é bomba ou lixo é recusado sem decodificar. Codec real (wasm),
 * numa foto de 12 MP.
 */
import { describe, expect, test } from 'bun:test'
import decodeJpeg from '@jsquash/jpeg/decode.js'

import type { DeliveryProofImageResult } from '../../src/delivery-proof-processing/application/delivery-proof-image.port.js'
import {
  PROOF_REDUCED_MAX_BYTES,
  PROOF_REDUCED_MAX_SIDE,
  PROOF_THUMBNAIL_MAX_BYTES,
  PROOF_THUMBNAIL_MAX_SIDE,
} from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'
import { processDeliveryProofImage } from '../../src/delivery-proof-processing/infrastructure/delivery-proof-image.processing.js'
import { createThreadedDeliveryProofImageProcessor } from '../../src/delivery-proof-processing/infrastructure/threaded-delivery-proof-image.processor.js'
import {
  buildCanhotoPhoto,
  buildExifSegment,
  buildJpegHeaderClaiming,
  buildLargeCameraPhoto,
  CANHOTO_PHOTO_ACCESS_KEY,
  containsText,
  EXIF_GPS_MARKER,
  withExif,
} from '../fixtures/delivery-proof-photo.fixture.js'

const SLOW_TEST_TIMEOUT_MILLISECONDS = 120_000
const ONE_MIB = 1024 * 1024

function processed(result: DeliveryProofImageResult) {
  if (result.kind !== 'processed') throw new Error(`expected processed, got ${result.code}`)
  return result
}

async function dimensionsOf(bytes: Uint8Array) {
  const image = await decodeJpeg(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  )
  return { height: image.height, width: image.width }
}

describe('tratamento da imagem do comprovante (spec 265)', () => {
  test(
    'original de 12 MP acima de 1 MiB vira versão ≤ 960 KiB, miniatura e leitura do código',
    async () => {
      const original = await buildLargeCameraPhoto()
      expect(original.byteLength).toBeGreaterThan(ONE_MIB)

      const result = processed(
        await processDeliveryProofImage({
          bytes: original,
          mediaType: 'image/jpeg',
          readBarcode: true,
          withThumbnail: true,
        }),
      )

      expect(result.reduced.bytes.byteLength).toBeLessThanOrEqual(PROOF_REDUCED_MAX_BYTES)
      expect(Math.max(result.reduced.width, result.reduced.height)).toBeLessThanOrEqual(
        PROOF_REDUCED_MAX_SIDE,
      )
      expect(await dimensionsOf(result.reduced.bytes)).toEqual({
        height: result.reduced.height,
        width: result.reduced.width,
      })
      expect(result.thumbnail).not.toBeNull()
      expect(result.thumbnail?.bytes.byteLength).toBeLessThanOrEqual(PROOF_THUMBNAIL_MAX_BYTES)
      const thumbnail = await dimensionsOf(result.thumbnail?.bytes ?? new Uint8Array())
      expect(Math.max(thumbnail.width, thumbnail.height)).toBeLessThanOrEqual(
        PROOF_THUMBNAIL_MAX_SIDE,
      )
      // A leitura é sobre o ORIGINAL, em resolução total.
      expect(result.barcodeText).toBe(CANHOTO_PHOTO_ACCESS_KEY)
    },
    SLOW_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'não lê o código nem gera a miniatura quando não foi pedido',
    async () => {
      const original = await buildCanhotoPhoto({
        format: 'jpeg',
        hasBarcode: true,
        heightPixels: 1200,
        moduleWidthPixels: 3,
        widthPixels: 2400,
      })

      const result = processed(
        await processDeliveryProofImage({
          bytes: original,
          mediaType: 'image/jpeg',
          readBarcode: false,
          withThumbnail: false,
        }),
      )

      expect(result.barcodeText).toBeNull()
      expect(result.thumbnail).toBeNull()
    },
    SLOW_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'EXIF e GPS não sobrevivem ao reencode (RNF2) e a orientação vira pixel',
    async () => {
      const upright = await buildCanhotoPhoto({
        format: 'jpeg',
        hasBarcode: true,
        heightPixels: 1200,
        moduleWidthPixels: 3,
        widthPixels: 2400,
      })
      const rotated = withExif(upright, buildExifSegment({ orientation: 6 }))
      expect(containsText(rotated, EXIF_GPS_MARKER)).toBe(true)

      const result = processed(
        await processDeliveryProofImage({
          bytes: rotated,
          mediaType: 'image/jpeg',
          readBarcode: false,
          withThumbnail: true,
        }),
      )

      expect(containsText(result.reduced.bytes, EXIF_GPS_MARKER)).toBe(false)
      expect(containsText(result.reduced.bytes, 'Exif')).toBe(false)
      expect(containsText(result.thumbnail?.bytes ?? new Uint8Array(), 'Exif')).toBe(false)
      // 2400 × 1200 com orientação 6 (90° horário) é uma foto em pé, 1200 × 2400, reduzida a 1000 × 2000.
      expect(result.reduced.width).toBe(1000)
      expect(result.reduced.height).toBe(PROOF_REDUCED_MAX_SIDE)
    },
    SLOW_TEST_TIMEOUT_MILLISECONDS,
  )

  test(
    'PNG e WebP também viram JPEG leve',
    async () => {
      for (const format of ['png', 'webp'] as const) {
        const original = await buildCanhotoPhoto({
          format,
          hasBarcode: true,
          heightPixels: 1200,
          moduleWidthPixels: 3,
          widthPixels: 2400,
        })

        const result = processed(
          await processDeliveryProofImage({
            bytes: original,
            mediaType: format === 'png' ? 'image/png' : 'image/webp',
            readBarcode: true,
            withThumbnail: false,
          }),
        )

        expect(Array.from(result.reduced.bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff])
        expect(result.barcodeText).toBe(CANHOTO_PHOTO_ACCESS_KEY)
      }
    },
    SLOW_TEST_TIMEOUT_MILLISECONDS,
  )

  test('o cabeçalho que declara pixels demais é recusado antes de decodificar (anti decompression bomb)', async () => {
    const bomb = buildJpegHeaderClaiming(60_000, 60_000)
    const loaded: string[] = []

    const result = await processDeliveryProofImage(
      { bytes: bomb, mediaType: 'image/jpeg', readBarcode: true, withThumbnail: true },
      {
        encodeJpeg: async () => new Uint8Array(),
        loadDecoder: async (mediaType) => {
          loaded.push(mediaType)
          return async () => {
            throw new Error('must not decode')
          }
        },
      },
    )

    expect(result).toEqual({ code: 'IMAGE_TOO_LARGE_PIXELS', kind: 'rejected' })
    expect(loaded).toEqual([])
  })

  test('bytes que não são imagem são "ilegíveis", fato do arquivo e não do trilho', async () => {
    const result = await processDeliveryProofImage({
      bytes: new Uint8Array(4096).fill(7),
      mediaType: 'image/jpeg',
      readBarcode: true,
      withThumbnail: true,
    })

    expect(result).toEqual({ code: 'IMAGE_UNREADABLE', kind: 'rejected' })
  })

  test('cabeçalho válido com corpo truncado nunca lança: o decodificador tolera e o resultado é uma imagem', async () => {
    const photo = await buildCanhotoPhoto({
      format: 'jpeg',
      hasBarcode: false,
      heightPixels: 800,
      moduleWidthPixels: 3,
      widthPixels: 1200,
    })

    const result = await processDeliveryProofImage({
      bytes: photo.subarray(0, 2048),
      mediaType: 'image/jpeg',
      readBarcode: false,
      withThumbnail: false,
    })

    // O mozjpeg decodifica o que chegou ("Premature end of JPEG file"); nenhuma das duas saídas lança.
    expect(['processed', 'rejected']).toContain(result.kind)
  })

  test('wasm que não carrega propaga (falha de infraestrutura), em vez de virar "ilegível"', async () => {
    const photo = await buildCanhotoPhoto({
      format: 'jpeg',
      hasBarcode: false,
      heightPixels: 400,
      moduleWidthPixels: 3,
      widthPixels: 600,
    })

    await expect(
      processDeliveryProofImage(
        { bytes: photo, mediaType: 'image/jpeg', readBarcode: false, withThumbnail: false },
        {
          encodeJpeg: async () => new Uint8Array(),
          loadDecoder: async () => async () => {
            throw new WebAssembly.CompileError('bad magic number')
          },
        },
      ),
    ).rejects.toBeInstanceOf(WebAssembly.CompileError)
  })

  test('reduzir que não cabe nem no menor lado é recusa permanente do arquivo', async () => {
    const photo = await buildCanhotoPhoto({
      format: 'jpeg',
      hasBarcode: false,
      heightPixels: 800,
      moduleWidthPixels: 3,
      widthPixels: 1200,
    })

    const result = await processDeliveryProofImage(
      { bytes: photo, mediaType: 'image/jpeg', readBarcode: false, withThumbnail: false },
      {
        // Um codec que sempre devolve mais que o teto: a escada esgota qualidade e lado.
        encodeJpeg: async () => new Uint8Array(PROOF_REDUCED_MAX_BYTES + 1),
        loadDecoder: async () => async () => ({
          data: new Uint8ClampedArray(1200 * 800 * 4),
          height: 800,
          width: 1200,
        }),
      },
    )

    expect(result).toEqual({ code: 'REDUCTION_TOO_LARGE', kind: 'rejected' })
  })

  test(
    'a thread real devolve o mesmo resultado e respeita o prazo',
    async () => {
      const original = await buildCanhotoPhoto({
        format: 'jpeg',
        hasBarcode: true,
        heightPixels: 1600,
        moduleWidthPixels: 3,
        widthPixels: 3000,
      })

      const result = processed(
        await createThreadedDeliveryProofImageProcessor().process({
          bytes: original,
          mediaType: 'image/jpeg',
          readBarcode: true,
          withThumbnail: true,
        }),
      )
      expect(result.barcodeText).toBe(CANHOTO_PHOTO_ACCESS_KEY)
      expect(result.reduced.bytes.byteLength).toBeLessThanOrEqual(PROOF_REDUCED_MAX_BYTES)
      expect(result.thumbnail).not.toBeNull()

      await expect(
        createThreadedDeliveryProofImageProcessor({ budgetMilliseconds: 1 }).process({
          bytes: original,
          mediaType: 'image/jpeg',
          readBarcode: true,
          withThumbnail: true,
        }),
      ).rejects.toThrow('exceeded its budget')
    },
    SLOW_TEST_TIMEOUT_MILLISECONDS,
  )
})
