/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `dataset`/`observedOn` viajam na query string, nunca no corpo: o corpo é **exatamente** o JSON do
 * extrator (o mesmo array que `toll-booths.json` guarda no bucket, T001) — envelopá-lo mudaria os
 * bytes e quebraria a resubida byte-a-byte que o `create-only` reconhece como `replayed`. Por isso
 * o sha256 do use case é calculado sobre os bytes crus lidos aqui, nunca sobre um `JSON.stringify`
 * de novo (reserializar não garante os mesmos bytes: ordem de chave, espaço).
 *
 * O array reaproveita a forma de `TollBoothExtractRowInput`/`osm-toll-booth.types.ts` — mesmos
 * campos que o extrator escreve — sem redeclarar um tipo novo, só o Zod que valida a entrada
 * externa (code-standart §7). `MONEY_DECIMAL` é o mesmo regex de `shared/money.constant.ts`.
 */
import { z } from 'zod'

import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES, HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { MONEY_DECIMAL } from '../../shared/money.constant.js'
import { invalidRequest } from '../../http/request-parsing.service.js'
import type { TollBoothExtractRowInput } from '../domain/toll-booth-extract.policy.js'

const DATASET_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const DATASET_MAX_LENGTH = 64
const OSM_NODE_ID_PATTERN = /^[1-9][0-9]*$/
const COORDINATE_PATTERN = /^-?[0-9]{1,3}\.[0-9]{1,7}$/

const tollBoothExtractQuerySchema = z.object({
  dataset: z.string().trim().min(1).max(DATASET_MAX_LENGTH).regex(DATASET_PATTERN),
  observedOn: z.iso.date(),
})

export type TollBoothExtractQuery = Readonly<{ dataset: string; observedOn: string }>

const ALLOWED_QUERY_KEYS = new Set(['dataset', 'observedOn'])

export function parseTollBoothExtractQuery(url: URL): TollBoothExtractQuery {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw invalidRequest()
  }

  const result = tollBoothExtractQuerySchema.safeParse({
    dataset: url.searchParams.get('dataset') ?? undefined,
    observedOn: url.searchParams.get('observedOn') ?? undefined,
  })
  if (!result.success) {
    throw invalidRequest(
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    )
  }

  return result.data
}

const tollBoothExtractRowSchema = z
  .object({
    chargeCar: z.string().regex(MONEY_DECIMAL).nullable(),
    chargePerAxle: z.string().regex(MONEY_DECIMAL).nullable(),
    latitude: z.string().regex(COORDINATE_PATTERN),
    longitude: z.string().regex(COORDINATE_PATTERN),
    name: z.string().min(1).nullable(),
    operator: z.string().min(1).nullable(),
    osmNodeId: z.string().regex(OSM_NODE_ID_PATTERN),
  })
  .strict() satisfies z.ZodType<TollBoothExtractRowInput>

export const tollBoothExtractBodySchema = z.array(tollBoothExtractRowSchema).min(1)

export async function parseTollBoothExtractBody(request: Request): Promise<{
  readonly booths: readonly TollBoothExtractRowInput[]
  readonly rawBody: Uint8Array
}> {
  assertJsonContentType(request.headers.get('content-type'))
  const rawBody = await readRequestBytes(request)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(rawBody))
  } catch {
    throw invalidRequest()
  }

  const result = tollBoothExtractBodySchema.safeParse(parsedJson)
  if (!result.success) {
    throw invalidRequest(
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    )
  }

  return { booths: result.data, rawBody }
}

function assertJsonContentType(value: string | null): void {
  if (value?.toLowerCase().split(';', 1)[0]?.trim() !== 'application/json') throw invalidRequest()
}

function concatenateChunks(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function readRequestBytes(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (reader === undefined) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES) {
      await reader.cancel()
      throw new ApiError(HTTP_ERROR.payloadTooLarge)
    }
    chunks.push(next.value)
  }
  return concatenateChunks(chunks, size)
}
