/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.15: a imagem que alimenta a leitura do canhoto. Aqui não se prova decodificação —
 * prova-se por onde os bytes entram. Um `<img>` sem `crossOrigin` contamina o canvas, o
 * `getImageData` lança `SecurityError`, o `catch` genérico de `decodeBarcodeFrame` engole a exceção
 * e o resultado é "ilegível" silencioso em 100% dos canhotos. A miniatura tem 320 px / 128 KiB
 * (RNF04) e não sustenta um Code-128 de 44 posições. As duas proibições são invisíveis em produção:
 * falham calado. Por isso viram asserção.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { readCanhotoFromUrl } from '../../src/modules/trip/shared/canhotoReviewRead.service'
import type { CanhotoTripDocument } from '../../src/modules/trip/shared/canhotoIdentification.service'

const DOCUMENT_ID = 'document-1'
const ACCESS_KEY = '35260112345678000190550010000001231000001234'
const ORIGINAL_URL = 'https://storage.test/original/receipt'
const FAKE_IMAGE_SIZE = 4

const TRIP_DOCUMENTS: readonly CanhotoTripDocument[] = [
  { accessKey: ACCESS_KEY, id: DOCUMENT_ID, nfeNumber: '123', nfeSeries: '1' },
]

let fetchedUrls: string[] = []
let imageConstructions = 0
const originalFetch = globalThis.fetch
const originalCreateImageBitmap = globalThis.createImageBitmap
const originalImage = globalThis.Image
const originalCreateElement = document.createElement.bind(document)
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext',
)

describe('a imagem que alimenta a leitura do canhoto (spec 220 T7.15)', () => {
  beforeEach(() => {
    fetchedUrls = []
    imageConstructions = 0
    globalThis.fetch = ((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])])))
    }) as unknown as typeof fetch
    globalThis.createImageBitmap = () =>
      Promise.resolve({
        close: () => undefined,
        height: FAKE_IMAGE_SIZE,
        width: FAKE_IMAGE_SIZE,
      } as ImageBitmap)
    HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        height,
        width,
      }),
    })) as unknown as HTMLCanvasElement['getContext']

    // Qualquer caminho que passe por `<img>` fica visível: os dois contadores são a asserção.
    globalThis.Image = class {
      constructor() {
        imageConstructions += 1
      }
    } as unknown as typeof Image
    document.createElement = (tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'img') imageConstructions += 1
      return originalCreateElement(tagName, options)
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    globalThis.createImageBitmap = originalCreateImageBitmap
    globalThis.Image = originalImage
    document.createElement = originalCreateElement
    if (originalGetContext !== undefined) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext)
    }
  })

  it('os bytes entram por fetch da URL original, nunca por um `<img>`', async () => {
    await readCanhotoFromUrl({
      canhotoOcrEnabled: false,
      documentId: DOCUMENT_ID,
      downloadUrl: ORIGINAL_URL,
      tripDocuments: TRIP_DOCUMENTS,
    })

    expect(fetchedUrls).toEqual([ORIGINAL_URL])
    expect(imageConstructions).toBe(0)
  })

  it('a imagem que não vem não vira leitura vazia: o erro sobe', async () => {
    globalThis.fetch = ((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve(new Response('', { status: 503 }))
    }) as unknown as typeof fetch

    let thrown: unknown
    try {
      await readCanhotoFromUrl({
        canhotoOcrEnabled: false,
        documentId: DOCUMENT_ID,
        downloadUrl: ORIGINAL_URL,
        tripDocuments: TRIP_DOCUMENTS,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('CANHOTO_IMAGE_FETCH_FAILED')
  })
})
