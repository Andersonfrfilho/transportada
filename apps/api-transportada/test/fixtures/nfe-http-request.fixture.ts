/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DOCUMENT_ID, DOCUMENT_XML, OTHER_DOCUMENT_ID } from './nfe-http-payload.fixture'
import { IDEMPOTENCY_KEY, IMPORT_ID } from './nfe-import-application.fixture'

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const NFE_IMPORTS_XML_PATH = '/nfe-imports/xml'
export const NFE_IMPORTS_DISTRIBUTION_PATH = '/nfe-imports/distribution'
export const NFE_IMPORTS_PATH = '/nfe-imports'
export const NFE_DOCUMENTS_PATH = '/nfe-documents'
export const MULTIPART_BOUNDARY = 'transportada-nfe-http-boundary'

type MultipartPart = {
  readonly filename?: string
  readonly name: string
  readonly value: string | Uint8Array
}

type RequestOptions = {
  readonly authorization?: string
  readonly correlationId?: string
  readonly headers?: Record<string, string>
  readonly idempotencyKey?: string
  readonly origin?: string
  readonly query?: string
}

export function uploadImportRequest(
  options: RequestOptions & {
    readonly body?: NonNullable<RequestInit['body']>
    readonly contentType?: string
    readonly events?: string[]
  } = {},
): Request {
  const form = new FormData()
  form.append('files', new File([DOCUMENT_XML], 'first.xml', { type: 'application/xml' }))
  form.append(
    'files',
    new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'batch.zip', { type: 'application/zip' }),
  )
  return observedRequest({
    body: options.body ?? form,
    events: options.events,
    headers: {
      ...baseHeaders(options),
      ...(options.contentType ? { 'content-type': options.contentType } : {}),
      ...(options.idempotencyKey === undefined
        ? { 'idempotency-key': IDEMPOTENCY_KEY }
        : options.idempotencyKey
          ? { 'idempotency-key': options.idempotencyKey }
          : {}),
    },
    method: 'POST',
    pathname: NFE_IMPORTS_XML_PATH,
    query: options.query,
  })
}

export function distributionRequest(options: RequestOptions = {}): Request {
  return new Request(`http://localhost${NFE_IMPORTS_DISTRIBUTION_PATH}${options.query ?? ''}`, {
    headers: {
      ...baseHeaders(options),
      ...(options.idempotencyKey === undefined
        ? { 'idempotency-key': 'nfe-distribution-0001' }
        : options.idempotencyKey
          ? { 'idempotency-key': options.idempotencyKey }
          : {}),
      ...(options.headers ?? {}),
    },
    method: 'POST',
  })
}

export function importsListRequest(options: RequestOptions = {}): Request {
  return new Request(`http://localhost${NFE_IMPORTS_PATH}${options.query ?? ''}`, {
    headers: baseHeaders(options),
  })
}

export function importDetailRequest(importId = IMPORT_ID, options: RequestOptions = {}): Request {
  return new Request(`http://localhost${NFE_IMPORTS_PATH}/${importId}${options.query ?? ''}`, {
    headers: baseHeaders(options),
  })
}

export function importItemsRequest(importId = IMPORT_ID, options: RequestOptions = {}): Request {
  return new Request(
    `http://localhost${NFE_IMPORTS_PATH}/${importId}/items${options.query ?? ''}`,
    {
      headers: baseHeaders(options),
    },
  )
}

export function reprocessImportRequest(
  importId = IMPORT_ID,
  options: RequestOptions = {},
): Request {
  return new Request(
    `http://localhost${NFE_IMPORTS_PATH}/${importId}/reprocess${options.query ?? ''}`,
    {
      headers: {
        ...baseHeaders(options),
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      },
      method: 'POST',
    },
  )
}

export function documentsListRequest(options: RequestOptions = {}): Request {
  return new Request(`http://localhost${NFE_DOCUMENTS_PATH}${options.query ?? ''}`, {
    headers: baseHeaders(options),
  })
}

export function documentDetailRequest(
  documentId = DOCUMENT_ID,
  options: RequestOptions = {},
): Request {
  return new Request(`http://localhost${NFE_DOCUMENTS_PATH}/${documentId}${options.query ?? ''}`, {
    headers: baseHeaders(options),
  })
}

export function documentXmlRequest(
  documentId = DOCUMENT_ID,
  options: RequestOptions = {},
): Request {
  return new Request(
    `http://localhost${NFE_DOCUMENTS_PATH}/${documentId}/xml${options.query ?? ''}`,
    {
      headers: baseHeaders(options),
    },
  )
}

export function documentEligibilityRequest(
  documentId = DOCUMENT_ID,
  options: RequestOptions = {},
): Request {
  return new Request(
    `http://localhost${NFE_DOCUMENTS_PATH}/${documentId}/eligibility${options.query ?? ''}`,
    {
      headers: baseHeaders(options),
    },
  )
}

export function invalidDocumentXmlRequest(options: RequestOptions = {}): Request {
  return documentXmlRequest(OTHER_DOCUMENT_ID, options)
}

export function rawUploadMultipartRequest(
  options: RequestOptions & {
    readonly parts: readonly MultipartPart[]
    readonly streamed?: boolean
  },
): Request {
  const bytes = multipartBytes(options.parts)
  return uploadImportRequest({
    ...options,
    body: options.streamed ? byteStream(bytes) : bytes,
    contentType: `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
  })
}

export function validUploadParts(): readonly MultipartPart[] {
  return [
    { filename: 'first.xml', name: 'files', value: DOCUMENT_XML },
    { filename: 'batch.zip', name: 'files', value: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
  ]
}

export async function responseApiError(response: Response): Promise<{
  readonly error: {
    readonly code: string
    readonly correlationId: string
    readonly message: string
  }
}> {
  return (await response.json()) as {
    readonly error: {
      readonly code: string
      readonly correlationId: string
      readonly message: string
    }
  }
}

export function multipartBytes(parts: readonly MultipartPart[]): Uint8Array {
  const chunks: Uint8Array[] = []
  for (const part of parts) {
    chunks.push(encode(`--${MULTIPART_BOUNDARY}\r\n`))
    const filename = part.filename === undefined ? '' : `; filename="${part.filename}"`
    chunks.push(encode(`Content-Disposition: form-data; name="${part.name}"${filename}\r\n\r\n`))
    chunks.push(typeof part.value === 'string' ? encode(part.value) : part.value)
    chunks.push(encode('\r\n'))
  }
  chunks.push(encode(`--${MULTIPART_BOUNDARY}--\r\n`))
  return concatenate(chunks)
}

function baseHeaders(options: RequestOptions): Record<string, string> {
  return {
    ...(options.authorization === ''
      ? {}
      : { authorization: options.authorization ?? 'Bearer token' }),
    ...(options.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.headers ?? {}),
  }
}

function observedRequest(input: {
  readonly body: NonNullable<RequestInit['body']>
  readonly events: string[] | undefined
  readonly headers: RequestInit['headers']
  readonly method: string
  readonly pathname: string
  readonly query: string | undefined
}): Request {
  const request = new Request(`http://localhost${input.pathname}${input.query ?? ''}`, {
    body: input.body,
    headers: input.headers,
    method: input.method,
  })
  if (input.events === undefined) return request
  const events = input.events
  return new Proxy(request, {
    get(target, property) {
      if (property === 'body') events.push('body')
      if (property === 'formData') {
        return async () => {
          events.push('formData')
          return await target.formData()
        }
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
        controller.enqueue(bytes.slice(offset, offset + 64 * 1024))
      }
      controller.close()
    },
  })
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}
