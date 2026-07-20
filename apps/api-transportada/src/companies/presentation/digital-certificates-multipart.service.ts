/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { findBytes, matchesAt } from './digital-certificates-multipart-bytes.service.js'

const MAX_BODY_BYTES = 1_048_576
const CRLF = Uint8Array.from([13, 10])
const HEADER_SEPARATOR = Uint8Array.from([13, 10, 13, 10])
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })
const TEXT_ENCODER = new TextEncoder()
type RequestBodyReader = {
  readonly cancel: () => Promise<void>
  readonly read: () => Promise<
    { readonly done: false; readonly value: Uint8Array } | { readonly done: true }
  >
}

export async function readCertificateMultipart(request: Request): Promise<{
  readonly body: Uint8Array
  readonly contentType: string
}> {
  const contentType = request.headers.get('content-type')
  const boundary = parseBoundary(contentType)
  const body = await readBody(request)
  try {
    assertPasswordPartUtf8({ body, boundary })
    return { body, contentType: contentType ?? '' }
  } catch (error) {
    body.fill(0)
    throw error
  }
}

function parseBoundary(contentType: string | null): string {
  const match = contentType?.match(
    /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))(?:\s*;.*)?$/i,
  )
  const boundary = match?.[1] ?? match?.[2]
  if (boundary === undefined || boundary.length > 70) throw invalidRequest()
  return boundary
}

async function readBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader() as unknown as RequestBodyReader | undefined
  if (reader === undefined) throw invalidRequest()
  const chunks: Uint8Array[] = []
  try {
    return await consumeBody({ chunks, reader })
  } finally {
    for (const chunk of chunks) chunk.fill(0)
  }
}

async function consumeBody(input: {
  readonly chunks: Uint8Array[]
  readonly reader: RequestBodyReader
}): Promise<Uint8Array> {
  let size = 0
  while (true) {
    const next = await input.reader.read()
    if (next.done) return concatenate({ chunks: input.chunks, size })
    size += next.value.byteLength
    if (size > MAX_BODY_BYTES) {
      next.value.fill(0)
      await cancelBestEffort(input.reader)
      throw new ApiError(HTTP_ERROR.payloadTooLarge)
    }
    input.chunks.push(next.value)
  }
}

async function cancelBestEffort(reader: RequestBodyReader): Promise<void> {
  try {
    await reader.cancel()
  } catch {
    // The application error remains PAYLOAD_TOO_LARGE even if transport cleanup fails.
  }
}

function concatenate(input: {
  readonly chunks: readonly Uint8Array[]
  readonly size: number
}): Uint8Array {
  const result = new Uint8Array(input.size)
  let offset = 0
  for (const chunk of input.chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function assertPasswordPartUtf8(input: {
  readonly body: Uint8Array
  readonly boundary: string
}): void {
  const boundary = TEXT_ENCODER.encode(`--${input.boundary}`)
  let boundaryOffset = findBytes({ needle: boundary, source: input.body })
  let passwords = 0
  while (boundaryOffset >= 0) {
    const part = readPart({ body: input.body, boundary, boundaryOffset })
    if (part === null) break
    if (isPasswordPart(part.headers)) {
      assertUtf8(input.body.subarray(part.valueStart, part.valueEnd))
      passwords += 1
    }
    boundaryOffset = part.nextBoundary
  }
  boundary.fill(0)
  if (passwords !== 1) throw invalidRequest()
}

type MultipartPartBounds = {
  readonly headers: string
  readonly nextBoundary: number
  readonly valueEnd: number
  readonly valueStart: number
}

function readPart(input: {
  readonly body: Uint8Array
  readonly boundary: Uint8Array
  readonly boundaryOffset: number
}): MultipartPartBounds | null {
  const afterBoundary = input.boundaryOffset + input.boundary.byteLength
  if (matchesAt({ needle: Uint8Array.from([45, 45]), offset: afterBoundary, source: input.body })) {
    return null
  }
  if (!matchesAt({ needle: CRLF, offset: afterBoundary, source: input.body })) {
    throw invalidRequest()
  }
  const headersStart = afterBoundary + CRLF.byteLength
  const headersEnd = findBytes({
    needle: HEADER_SEPARATOR,
    offset: headersStart,
    source: input.body,
  })
  if (headersEnd < 0) throw invalidRequest()
  const valueStart = headersEnd + HEADER_SEPARATOR.byteLength
  const delimiter = TEXT_ENCODER.encode(`\r\n${new TextDecoder().decode(input.boundary)}`)
  const valueEnd = findBytes({ needle: delimiter, offset: valueStart, source: input.body })
  delimiter.fill(0)
  if (valueEnd < 0) throw invalidRequest()
  return {
    headers: decodeHeaders(input.body.subarray(headersStart, headersEnd)),
    nextBoundary: valueEnd + CRLF.byteLength,
    valueEnd,
    valueStart,
  }
}

function decodeHeaders(bytes: Uint8Array): string {
  try {
    return UTF8_DECODER.decode(bytes)
  } catch {
    throw invalidRequest()
  }
}

function isPasswordPart(headers: string): boolean {
  return headers
    .split('\r\n')
    .some((header) =>
      /^content-disposition:\s*form-data\s*;\s*name="password"(?:\s*;.*)?$/i.test(header),
    )
}

function assertUtf8(bytes: Uint8Array): void {
  try {
    UTF8_DECODER.decode(bytes)
  } catch {
    throw invalidRequest()
  }
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}
