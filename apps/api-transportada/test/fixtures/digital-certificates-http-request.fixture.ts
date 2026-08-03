/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  SYNTHETIC_CERTIFICATE,
  SYNTHETIC_PASSWORD,
  VALID_IDEMPOTENCY_KEY,
} from './digital-certificates-http-payload.fixture'

export const DIGITAL_CERTIFICATES_PATH = '/digital-certificates'
export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const MULTIPART_BOUNDARY = 'transportada-synthetic-boundary'

type MultipartPart = {
  readonly filename?: string
  readonly name: string
  readonly value: string | Uint8Array
}

type PostRequestParams = {
  readonly authorization?: string
  readonly body?: NonNullable<RequestInit['body']>
  readonly contentType?: string
  readonly correlationId?: string
  readonly events?: string[]
  readonly idempotencyKey?: string
  readonly origin?: string
  readonly purpose?: string
  readonly query?: string
}

export function certificateDeleteRequest(
  params: { readonly authorization?: string; readonly query?: string } = {},
): Request {
  return new Request(`http://localhost${DIGITAL_CERTIFICATES_PATH}${params.query ?? ''}`, {
    headers: requestHeaders(params),
    method: 'DELETE',
  })
}

export function certificateGetRequest(
  params: {
    readonly authorization?: string
    readonly origin?: string
    readonly query?: string
  } = {},
): Request {
  return new Request(`http://localhost${DIGITAL_CERTIFICATES_PATH}${params.query ?? ''}`, {
    headers: requestHeaders(params),
  })
}

export function certificatePostRequest(params: PostRequestParams = {}): Request {
  const form = new FormData()
  form.append('certificate', new File([SYNTHETIC_CERTIFICATE], 'synthetic.pfx'))
  form.append('password', new TextDecoder().decode(SYNTHETIC_PASSWORD))
  form.append('purpose', params.purpose ?? 'cte')
  return observedRequest({
    body: params.body ?? form,
    events: params.events,
    headers: {
      ...requestHeaders(params),
      ...(params.contentType ? { 'content-type': params.contentType } : {}),
      ...(params.correlationId ? { 'x-correlation-id': params.correlationId } : {}),
      ...(params.idempotencyKey === undefined
        ? { 'idempotency-key': VALID_IDEMPOTENCY_KEY }
        : params.idempotencyKey
          ? { 'idempotency-key': params.idempotencyKey }
          : {}),
    },
    query: params.query,
  })
}

export function rawMultipartRequest(
  params: Omit<PostRequestParams, 'body' | 'contentType'> & {
    readonly parts: readonly MultipartPart[]
    readonly streamed?: boolean
  },
): Request {
  const bytes = multipartBytes(params.parts)
  return certificatePostRequest({
    ...params,
    body: params.streamed ? byteStream(bytes) : bytes,
    contentType: `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
  })
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
  return concatenateBytes(chunks)
}

export function validMultipartParts(purpose = 'cte'): readonly MultipartPart[] {
  return [
    { filename: 'synthetic.pfx', name: 'certificate', value: SYNTHETIC_CERTIFICATE },
    { name: 'password', value: SYNTHETIC_PASSWORD },
    { name: 'purpose', value: purpose },
  ]
}

function requestHeaders(params: {
  readonly authorization?: string
  readonly origin?: string
}): Record<string, string> {
  return {
    ...(params.authorization === ''
      ? {}
      : { authorization: params.authorization ?? 'Bearer token' }),
    ...(params.origin ? { origin: params.origin } : {}),
  }
}

function observedRequest(input: {
  readonly body: NonNullable<RequestInit['body']>
  readonly events: string[] | undefined
  readonly headers: RequestInit['headers']
  readonly query: string | undefined
}): Request {
  const request = new Request(`http://localhost${DIGITAL_CERTIFICATES_PATH}${input.query ?? ''}`, {
    body: input.body,
    headers: input.headers,
    method: 'POST',
  })
  if (input.events === undefined) return request
  return observeRequestBody({ events: input.events, request })
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

function observeRequestBody(input: {
  readonly events: string[]
  readonly request: Request
}): Request {
  return new Proxy(input.request, {
    get(target, property) {
      if (property === 'body') input.events.push('body')
      if (property === 'formData') {
        return async () => {
          input.events.push('formData')
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

function concatenateBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}
