/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T7.3: a thread do canhoto só responde `null` para o que ela de fato olhou. Decodificador
 * que não carrega, ou binário wasm quebrado, é falha de infraestrutura e tem de chegar ao chamador
 * como erro — `null` ali carimbaria `canhoto_read_attempted_at` e tiraria o comprovante da fila para
 * sempre, sem Sentry, em toda foto.
 */
import { describe, expect, test } from 'bun:test'

import type { DecodeCanhotoBarcodeParams } from '../../src/canhoto-read/application/canhoto-barcode-decoder.port.js'
import { readBarcodeText } from '../../src/canhoto-read/infrastructure/canhoto-barcode.worker.js'

const PARAMS: DecodeCanhotoBarcodeParams = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  mediaType: 'image/jpeg',
}

describe('canhoto barcode worker (spec 222 T7.3)', () => {
  test('a decoder module that does not load propagates, instead of becoming "no code"', async () => {
    const loadDecoder = async (): Promise<never> => {
      throw new Error("Cannot find module '@jsquash/jpeg/decode.js'")
    }

    await expect(readBarcodeText({ loadDecoder, params: PARAMS })).rejects.toThrow(
      'Cannot find module',
    )
  })

  test('a wasm binary that will not compile propagates, instead of becoming "no code"', async () => {
    const loadDecoder = async () => async () => {
      throw new WebAssembly.CompileError('bad magic number')
    }

    await expect(readBarcodeText({ loadDecoder, params: PARAMS })).rejects.toBeInstanceOf(
      WebAssembly.CompileError,
    )
  })

  test('a wasm binary that will not link propagates, instead of becoming "no code"', async () => {
    const loadDecoder = async () => async () => {
      throw new WebAssembly.LinkError('import not found')
    }

    await expect(readBarcodeText({ loadDecoder, params: PARAMS })).rejects.toBeInstanceOf(
      WebAssembly.LinkError,
    )
  })

  test('bytes the decoder refuses are still "looked and found nothing"', async () => {
    const loadDecoder = async () => async () => {
      throw new Error('Decoding error')
    }

    expect(await readBarcodeText({ loadDecoder, params: PARAMS })).toBeNull()
  })

  test('an image without a readable Code128 is "looked and found nothing"', async () => {
    const width = 8
    const height = 8
    const loadDecoder = async () => async () => ({
      data: new Uint8ClampedArray(width * height * 4).fill(255),
      height,
      width,
    })

    expect(await readBarcodeText({ loadDecoder, params: PARAMS })).toBeNull()
  })

  test('the loader is asked for the media type of the proof being read', async () => {
    const asked: string[] = []
    const loadDecoder = async (mediaType: DecodeCanhotoBarcodeParams['mediaType']) => {
      asked.push(mediaType)
      return async () => {
        throw new Error('Decoding error')
      }
    }

    await readBarcodeText({ loadDecoder, params: { ...PARAMS, mediaType: 'image/webp' } })

    expect(asked).toEqual(['image/webp'])
  })
})
