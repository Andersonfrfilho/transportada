/**
 * Copyright (c) 2026 Anderson — Ada Technology. Licença: proprietária.
 *
 * Servidor local da captura assistida: entrega a próxima página da fila e recebe o que o
 * userscript leu na página que a pessoa abriu. Não navega sozinho e não fala com o Cosmos.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  appendCaptureRecord,
  OUTPUT_PATH,
  type PendingGtin,
  readCapturedGtins,
  selectPendingGtins,
} from './harvest-queue.js'

const PORT = 53999
const COSMOS_PRODUCT_URL = 'https://cosmos.bluesoft.com.br/produtos'
const TOKEN_PATH = `${process.env.HOME}/.config/transportada/capture-token`
const MAX_SNIPPET_LENGTH = 4000

const CAPTURE_STATUSES: ReadonlySet<string> = new Set(['found', 'no_dimensions', 'not_found'])

type CapturePayload = {
  readonly unitGtin: string
  readonly status: string
  readonly pageUrl: string
  readonly extracted?: Record<string, unknown>
  readonly snippet?: string
}

function parseCapture(value: unknown): CapturePayload | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { unitGtin, status, pageUrl, extracted, snippet } = value as Record<string, unknown>
  if (typeof unitGtin !== 'string' || !/^\d{8,14}$/.test(unitGtin)) return undefined
  if (typeof status !== 'string' || !CAPTURE_STATUSES.has(status)) return undefined
  if (typeof pageUrl !== 'string' || !pageUrl.startsWith(`${COSMOS_PRODUCT_URL}/`)) return undefined
  const safeSnippet = typeof snippet === 'string' ? snippet.slice(0, MAX_SNIPPET_LENGTH) : undefined
  return {
    unitGtin,
    status,
    pageUrl,
    ...(typeof extracted === 'object' && extracted !== null
      ? { extracted: extracted as Record<string, unknown> }
      : {}),
    ...(safeSnippet ? { snippet: safeSnippet } : {}),
  }
}

async function loadOrCreateToken(): Promise<string> {
  const existing = await readFile(TOKEN_PATH, 'utf8').catch(() => '')
  if (existing.trim()) return existing.trim()
  const token = randomBytes(24).toString('hex')
  await mkdir(dirname(TOKEN_PATH), { recursive: true })
  await writeFile(TOKEN_PATH, token, { mode: 0o600 })
  return token
}

function describeNext(queue: readonly PendingGtin[]): Record<string, unknown> {
  const next = queue[0]
  if (!next) return { done: true, remaining: 0 }
  return { ...next, url: `${COSMOS_PRODUCT_URL}/${next.unitGtin}`, remaining: queue.length }
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('variável DATABASE_URL ausente')

const token = await loadOrCreateToken()
const captured = await readCapturedGtins()
const queue = (await selectPendingGtins(databaseUrl)).filter(
  (item) => !captured.has(item.cartonGtin),
)

Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  async fetch(request) {
    if (request.headers.get('x-capture-token') !== token)
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' && pathname === '/next') return Response.json(describeNext(queue))
    if (request.method !== 'POST' || pathname !== '/capture')
      return Response.json({ error: 'NOT_FOUND' }, { status: 404 })

    const capture = parseCapture(await request.json().catch(() => undefined))
    if (!capture) return Response.json({ error: 'INVALID_CAPTURE' }, { status: 400 })
    const index = queue.findIndex((item) => item.unitGtin === capture.unitGtin)
    if (index === -1) return Response.json({ ignored: true, ...describeNext(queue) })

    const [item] = queue.splice(index, 1)
    if (!item) return Response.json(describeNext(queue))
    await appendCaptureRecord({
      ...capture,
      cartonGtin: item.cartonGtin,
      capturedAt: new Date().toISOString(),
    })
    console.log(
      JSON.stringify({
        level: 'info',
        gtin: item.cartonGtin,
        status: capture.status,
        remaining: queue.length,
      }),
    )
    return Response.json(describeNext(queue))
  },
})

console.log(
  JSON.stringify({ level: 'info', port: PORT, pending: queue.length, output: OUTPUT_PATH }),
)
console.log(`Token do userscript (cole uma vez no menu do Tampermonkey): ${token}`)
const first = describeNext(queue)
if (typeof first.url === 'string') Bun.spawn(['open', first.url])
