/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8: a API fala com a rota interna do worker (multipart: foto + notas abertas) e só aceita o veredito.
 */
import { describe, expect, test } from 'bun:test'

import {
  BotCanhotoReadError,
  createWorkerCanhotoReader,
} from '../../src/whatsapp/infrastructure/worker-canhoto-reader.gateway.js'

const CONFIG = { baseUrl: 'http://worker.internal/', token: 'x'.repeat(40) }
const CANDIDATES = [{ documentId: 'DOC-A', number: '17234' }]

function reader(respond: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = new Request(url as string, init)
    calls.push(request)
    return respond(request)
  }) as typeof globalThis.fetch
  return { calls, reader: createWorkerCanhotoReader(CONFIG, fetchImpl) }
}

const read = (r: ReturnType<typeof createWorkerCanhotoReader>) =>
  r.read({ bytes: new Uint8Array([1, 2, 3]), candidates: CANDIDATES })

describe('worker canhoto reader gateway', () => {
  test('posts the photo and the open notes with the bearer token and returns the verdict', async () => {
    const verdict: Awaited<ReturnType<ReturnType<typeof createWorkerCanhotoReader>['read']>> = {
      ambiguous: false,
      candidates: [{ documentId: 'DOC-A', match: 'exact' }],
      markers: 2,
    }
    const t = reader(() => Response.json({ data: verdict }))
    expect(await read(t.reader)).toEqual(verdict)
    const [request] = t.calls
    expect(request?.url).toBe('http://worker.internal/internal/bot-canhoto-reads')
    expect(request?.headers.get('authorization')).toBe(`Bearer ${CONFIG.token}`)
    const form = await request?.formData()
    expect(JSON.parse(String(form?.get('candidates')))).toEqual(CANDIDATES)
    expect(form?.get('image')).toBeInstanceOf(Blob)
  })

  test('maps 503 to busy, 404 and network failure to unreachable, and the rest to failed', async () => {
    const reasonOf = async (response: () => Response) => {
      const t = reader(response)
      return read(t.reader).catch((error: BotCanhotoReadError) => error.reason)
    }
    expect(await reasonOf(() => new Response('', { status: 503 }))).toBe('busy')
    expect(await reasonOf(() => new Response('', { status: 404 }))).toBe('unreachable')
    expect(await reasonOf(() => new Response('', { status: 502 }))).toBe('failed')
    expect(await reasonOf(() => Response.json({ data: { markers: 'x' } }))).toBe('failed')
    const down = createWorkerCanhotoReader(CONFIG, (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof globalThis.fetch)
    expect(await read(down).catch((error: BotCanhotoReadError) => error.reason)).toBe('unreachable')
  })
})
