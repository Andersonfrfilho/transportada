/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8: o OCR local do canhoto que o bot lê (ADR 0113 §5).
 */
import { afterEach, describe, expect, test } from 'bun:test'
import sharp from 'sharp'

import {
  CanhotoOcrError,
  type CanhotoOcrReaderPort,
} from '../src/canhoto-ocr/application/canhoto-ocr-reader.port.js'
import { evaluateCanhotoText } from '../src/canhoto-ocr/domain/canhoto-ocr-match.policy.js'
import { CANHOTO_OCR_MAX_INPUT_PIXELS } from '../src/canhoto-ocr/domain/canhoto-ocr.constant.js'
import { openCanhotoImage } from '../src/canhoto-ocr/infrastructure/canhoto-image.decoder.js'
import { createThreadedCanhotoOcrReader } from '../src/canhoto-ocr/infrastructure/threaded-canhoto-ocr.reader.js'
import { parseWorkerEnvironment } from '../src/config/environment.schema.js'
import {
  BOT_CANHOTO_READ_PATH,
  createBotCanhotoReadHandler,
} from '../src/http/bot-canhoto-read-request-handler.service.js'
import type { WorkerLogger } from '../src/shared/worker.types.js'

const TOKEN = 'x'.repeat(40)
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const server = { timeout: () => undefined }
const candidates = [
  { documentId: 'doc-a', number: '17234' },
  { documentId: 'doc-b', number: '17300' },
  { documentId: 'doc-c', number: '000981' },
]
const MARKER_LINES = [
  'RECEBEMOS DE EMPRESA X OS PRODUTOS',
  'DATA DE RECEBIMENTO',
  'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR',
]

describe('canhoto text evaluation', () => {
  test('one exact number is the note, whatever the separators and leading zeros', () => {
    expect(evaluateCanhotoText({ candidates, lines: ['NF-e Nº 17.234 SÉRIE 1'] })).toEqual({
      ambiguous: false,
      candidates: [{ documentId: 'doc-a', match: 'exact' }],
      markers: 1,
    })
    expect(evaluateCanhotoText({ candidates, lines: ['Nº 000.981'] }).candidates).toEqual([
      { documentId: 'doc-c', match: 'exact' },
    ])
  })

  test('two candidate numbers on the photo is ambiguous and lists both', () => {
    const result = evaluateCanhotoText({ candidates, lines: ['17234', '17300'] })
    expect(result.ambiguous).toBe(true)
    expect(result.candidates.map((item) => item.documentId).sort()).toEqual(['doc-a', 'doc-b'])
  })

  test('one wrong digit on 5+ digit numbers is near, never exact, and never on short numbers', () => {
    expect(evaluateCanhotoText({ candidates, lines: ['17284'] }).candidates).toEqual([
      { documentId: 'doc-a', match: 'near' },
    ])
    expect(evaluateCanhotoText({ candidates, lines: ['00982'] }).candidates).toEqual([])
  })

  test('exact wins over near and a stranger number matches nothing', () => {
    expect(evaluateCanhotoText({ candidates, lines: ['17234 17301'] }).candidates).toEqual([
      { documentId: 'doc-a', match: 'exact' },
    ])
    expect(evaluateCanhotoText({ candidates, lines: ['99999'] })).toEqual({
      ambiguous: false,
      candidates: [],
      markers: 0,
    })
  })

  test('counts the markers of the detachable strip; a single marker is not enough to prove it', () => {
    expect(
      evaluateCanhotoText({ candidates: [], lines: MARKER_LINES }).markers,
    ).toBeGreaterThanOrEqual(3)
    expect(evaluateCanhotoText({ candidates: [], lines: ['CHAVE DE ACESSO'] }).markers).toBe(0)
  })

  test('two notes with the same number are ambiguous', () => {
    const result = evaluateCanhotoText({
      candidates: [...candidates, { documentId: 'doc-d', number: '17234' }],
      lines: ['17234'],
    })
    expect(result.ambiguous).toBe(true)
    expect(result.candidates).toHaveLength(2)
  })
})

describe('threaded canhoto reader', () => {
  const readers: CanhotoOcrReaderPort[] = []
  const workerUrl = new URL('./fixtures/canhoto-ocr-fake.worker.ts', import.meta.url)
  const create = (
    options: {
      readonly fake?: { readonly neverReady?: boolean; readonly readyDelayMilliseconds?: number }
      readonly readyTimeoutMilliseconds?: number
      readonly timeoutMilliseconds?: number
    } = {},
  ) => {
    const reader = createThreadedCanhotoOcrReader({
      modelDirectory: '/unused',
      readyTimeoutMilliseconds: options.readyTimeoutMilliseconds ?? 3000,
      timeoutMilliseconds: options.timeoutMilliseconds ?? 3000,
      workerData: { fake: options.fake ?? {} },
      workerUrl,
    })
    readers.push(reader)
    return reader
  }
  const started = async (options: Parameters<typeof create>[0] = {}) => {
    const reader = create(options)
    expect(await reader.start?.()).toBe(true)
    return reader
  }
  const reasonOf = (promise: Promise<unknown>) =>
    promise.then(
      () => 'read',
      (error: unknown) => (error instanceof CanhotoOcrError ? error.reason : 'other'),
    )
  afterEach(async () => {
    await Promise.all(readers.splice(0).map((reader) => reader.close()))
  })

  test('answers from one live thread, one photo at a time', async () => {
    const reader = await started()
    const results = await Promise.all([
      reader.read({ bytes: new Uint8Array([1, 4]), candidates }),
      reader.read({ bytes: new Uint8Array([1, 5]), candidates }),
    ])
    expect(results.map((result) => result.markers)).toEqual([4, 5])
  })

  test('C6: until the engine is loaded, a read is busy at once; once ready, it reads', async () => {
    const reader = create({ fake: { readyDelayMilliseconds: 200 } })
    const ready = reader.start?.()
    expect(await reasonOf(reader.read({ bytes: new Uint8Array([1]), candidates }))).toBe('busy')
    expect(await ready).toBe(true)
    expect((await reader.read({ bytes: new Uint8Array([1, 6]), candidates })).markers).toBe(6)
  })

  test('C6: a read without start warms the thread up and answers busy, never waits for the load', async () => {
    const reader = create({ fake: { readyDelayMilliseconds: 100 } })
    expect(await reasonOf(reader.read({ bytes: new Uint8Array([1]), candidates }))).toBe('busy')
    await Bun.sleep(250)
    expect((await reader.read({ bytes: new Uint8Array([1, 3]), candidates })).markers).toBe(3)
  })

  test('C6: an engine that never loads hits the readiness deadline and stays busy', async () => {
    const reader = create({ fake: { neverReady: true }, readyTimeoutMilliseconds: 200 })
    expect(await reader.start?.()).toBe(false)
    expect(await reasonOf(reader.read({ bytes: new Uint8Array([1]), candidates }))).toBe('busy')
  })

  test('an engine failure rejects as engine_failed and the next photo still reads', async () => {
    const reader = await started()
    expect(await reasonOf(reader.read({ bytes: new Uint8Array([3]), candidates }))).toBe(
      'engine_failed',
    )
    expect((await reader.read({ bytes: new Uint8Array([1, 2]), candidates })).markers).toBe(2)
  })

  test('a stuck read hits the deadline; the replacement thread loads again before reading', async () => {
    const reader = await started({ timeoutMilliseconds: 300 })
    expect(await reasonOf(reader.read({ bytes: new Uint8Array([2]), candidates }))).toBe('timeout')
    expect(await reasonOf(reader.read({ bytes: new Uint8Array([1]), candidates }))).toBe('busy')
    expect(await reader.start?.()).toBe(true)
    expect((await reader.read({ bytes: new Uint8Array([1, 7]), candidates })).markers).toBe(7)
  })

  test('S7: one reading and one waiting at most; the next is busy at once', async () => {
    const reader = await started({ timeoutMilliseconds: 400 })
    const stuck = [
      reasonOf(reader.read({ bytes: new Uint8Array([2]), candidates, queueKey: 'C1' })),
      reasonOf(reader.read({ bytes: new Uint8Array([2]), candidates, queueKey: 'C2' })),
    ]
    const startedAt = Date.now()
    expect(
      await reasonOf(reader.read({ bytes: new Uint8Array([1]), candidates, queueKey: 'C3' })),
    ).toBe('busy')
    expect(Date.now() - startedAt).toBeLessThan(100)
    await reader.close()
    await Promise.all(stuck)
  })

  test('S7: a company waits behind its own photo — the second one of the same company is busy', async () => {
    const reader = await started({ timeoutMilliseconds: 400 })
    const stuck = reasonOf(reader.read({ bytes: new Uint8Array([2]), candidates, queueKey: 'C1' }))
    expect(
      await reasonOf(reader.read({ bytes: new Uint8Array([1]), candidates, queueKey: 'C1' })),
    ).toBe('busy')
    await reader.close()
    await stuck
  })
})

function createLogger(lines: unknown[]): WorkerLogger {
  const push = (...args: unknown[]) => {
    lines.push(args)
  }
  return { debug: push, error: push, info: push, warn: push } as unknown as WorkerLogger
}

function multipart(
  init: {
    candidates?: string
    image?: Uint8Array<ArrayBuffer>
    queueKey?: string
    token?: null | string
  } = {},
) {
  const form = new FormData()
  form.set('image', new Blob([init.image ?? JPEG_BYTES], { type: 'image/jpeg' }))
  form.set('candidates', init.candidates ?? JSON.stringify(candidates))
  if (init.queueKey !== undefined) form.set('queueKey', init.queueKey)
  const headers: Record<string, string> = {}
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? TOKEN}`
  return new Request(`http://worker${BOT_CANHOTO_READ_PATH}`, {
    body: form,
    headers,
    method: 'POST',
  })
}

describe('bot canhoto read route', () => {
  const reader = (
    result: Awaited<ReturnType<CanhotoOcrReaderPort['read']>> | Error,
  ): CanhotoOcrReaderPort => ({
    close: async () => undefined,
    read: async () => {
      if (result instanceof Error) throw result
      return result
    },
  })
  const verdict = {
    ambiguous: false,
    candidates: [{ documentId: 'doc-a', match: 'exact' as const }],
    markers: 2,
  }

  test('answers only the verdict and logs no photo, text or note number', async () => {
    const lines: unknown[] = []
    const handle = createBotCanhotoReadHandler({
      logger: createLogger(lines),
      reader: reader(verdict),
      token: TOKEN,
    })
    const response = await handle(multipart(), server)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: verdict })
    const logged = JSON.stringify(lines)
    expect(logged).not.toContain('17234')
    expect(logged).not.toContain('doc-a')
  })

  test('hides the route from anyone without the token and rejects bad input', async () => {
    const handle = createBotCanhotoReadHandler({
      logger: createLogger([]),
      reader: reader(verdict),
      token: TOKEN,
    })
    expect((await handle(multipart({ token: null }), server)).status).toBe(404)
    expect((await handle(multipart({ token: 'y'.repeat(40) }), server)).status).toBe(404)
    expect((await handle(multipart({ candidates: 'not json' }), server)).status).toBe(400)
    expect(
      (
        await handle(
          multipart({ candidates: JSON.stringify([{ documentId: 'a', number: 'abc' }]) }),
          server,
        )
      ).status,
    ).toBe(400)
    expect((await handle(multipart({ image: new Uint8Array() }), server)).status).toBe(400)
    const plain = new Request(`http://worker${BOT_CANHOTO_READ_PATH}`, {
      body: 'x',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' },
      method: 'POST',
    })
    expect((await handle(plain, server)).status).toBe(400)
  })

  test('S6: only a JPEG or PNG by its bytes reaches the decoder; anything else is 415', async () => {
    let reads = 0
    const handle = createBotCanhotoReadHandler({
      logger: createLogger([]),
      reader: {
        close: async () => undefined,
        read: async () => {
          reads += 1
          return verdict
        },
      },
      token: TOKEN,
    })
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const response = await handle(multipart({ image: pdf }), server)
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } })
    expect(reads).toBe(0)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect((await handle(multipart({ image: png }), server)).status).toBe(200)
  })

  test('S7: the queue key (the company) goes to the reader; a long one is refused', async () => {
    const keys: (string | undefined)[] = []
    const handle = createBotCanhotoReadHandler({
      logger: createLogger([]),
      reader: {
        close: async () => undefined,
        read: async (params) => {
          keys.push(params.queueKey)
          return verdict
        },
      },
      token: TOKEN,
    })
    expect((await handle(multipart({ queueKey: 'company-1' }), server)).status).toBe(200)
    expect((await handle(multipart(), server)).status).toBe(200)
    expect(keys).toEqual(['company-1', undefined])
    expect((await handle(multipart({ queueKey: 'k'.repeat(65) }), server)).status).toBe(400)
  })

  test('maps a busy queue to 503 and an engine failure to 502', async () => {
    const busy = createBotCanhotoReadHandler({
      logger: createLogger([]),
      reader: reader(new CanhotoOcrError('busy')),
      token: TOKEN,
    })
    expect((await busy(multipart(), server)).status).toBe(503)
    const failed = createBotCanhotoReadHandler({
      logger: createLogger([]),
      reader: reader(new CanhotoOcrError('timeout')),
      token: TOKEN,
    })
    const response = await failed(multipart(), server)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: { code: 'READ_FAILED', reason: 'timeout' } })
  })
})

describe('canhoto image decode limits (S6)', () => {
  test('an image above the pixel ceiling is refused before it is decoded', async () => {
    const huge = await sharp({
      create: { background: '#ffffff', channels: 3, height: 6400, width: 6400 },
    })
      .png({ compressionLevel: 1 })
      .toBuffer()
    expect(CANHOTO_OCR_MAX_INPUT_PIXELS).toBe(40_000_000)
    await expect(openCanhotoImage(huge).toBuffer()).rejects.toThrow(/pixel limit/u)
  })

  test('a truncated image fails instead of decoding half of it', async () => {
    const jpeg = await sharp({
      create: { background: '#ffffff', channels: 3, height: 64, width: 64 },
    })
      .jpeg()
      .toBuffer()
    await expect(openCanhotoImage(jpeg.subarray(0, jpeg.length / 2)).toBuffer()).rejects.toThrow()
  })
})

describe('canhoto ocr environment', () => {
  const base = {
    APP_ENV: 'staging',
    DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
    QUEUE_PREFIX: 'transportada_staging',
    RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
    CANHOTO_OCR_MODEL_DIR: '/models/canhoto-ocr',
  }

  test('is on outside production and off in production unless asked', () => {
    expect(parseWorkerEnvironment(base).canhotoOcr).toEqual({
      modelDirectory: '/models/canhoto-ocr',
      timeoutMilliseconds: 30_000,
    })
    expect(
      parseWorkerEnvironment({ ...base, CANHOTO_OCR_ENABLED: 'false' }).canhotoOcr,
    ).toBeUndefined()
    expect(parseWorkerEnvironment({ ...base, CANHOTO_OCR_ENABLED: '' }).canhotoOcr).toBeDefined()
  })

  test('does not exist without the model directory, and rejects a typo', () => {
    expect(
      parseWorkerEnvironment({ ...base, CANHOTO_OCR_MODEL_DIR: '' }).canhotoOcr,
    ).toBeUndefined()
    expect(() => parseWorkerEnvironment({ ...base, CANHOTO_OCR_ENABLED: 'yes' })).toThrow()
  })
})
