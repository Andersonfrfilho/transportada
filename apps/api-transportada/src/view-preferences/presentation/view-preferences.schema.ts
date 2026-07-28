/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const VIEW_KEY = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const MAX_VIEW_KEY_LENGTH = 120

const viewKeySchema = z.string().min(1).max(MAX_VIEW_KEY_LENGTH).regex(VIEW_KEY)

const saveViewPreferencesSchema = z
  .object({
    preferences: z.record(z.string(), z.unknown()),
    viewKey: viewKeySchema,
  })
  .strict()

export type SaveViewPreferencesRequest = {
  readonly preferences: Record<string, unknown>
  readonly viewKey: string
}

export function parseViewKeyQuery(request: Request): string {
  const viewKey = new URL(request.url).searchParams.get('viewKey')?.trim() ?? ''
  const result = viewKeySchema.safeParse(viewKey)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

export async function parseSaveViewPreferencesRequest(
  request: Request,
): Promise<SaveViewPreferencesRequest> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = saveViewPreferencesSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return { preferences: result.data.preferences, viewKey: result.data.viewKey }
}

function assertJsonContentType(value: string | null): void {
  if (value?.toLowerCase().split(';', 1)[0]?.trim() !== 'application/json') {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}

async function readBoundedRequestBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (reader === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > 1_048_576) {
      await reader.cancel()
      throw new ApiError(HTTP_ERROR.payloadTooLarge)
    }
    chunks.push(next.value)
  }
  return new TextDecoder().decode(concatenateChunks({ chunks, size }))
}

type ConcatenateChunksParams = {
  readonly chunks: readonly Uint8Array[]
  readonly size: number
}

function concatenateChunks({ chunks, size }: ConcatenateChunksParams): Uint8Array {
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
