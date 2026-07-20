/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { multipartBytes, validMultipartParts } from './digital-certificates-http-request.fixture'

export function replaceMultipartPart(replacement: {
  readonly name: string
  readonly value: string | Uint8Array
}): ReturnType<typeof validMultipartParts> {
  return validMultipartParts().map((part) =>
    part.name === replacement.name ? { ...part, value: replacement.value } : part,
  )
}

export function invalidMultipartParts(): readonly ReturnType<typeof validMultipartParts>[] {
  return [
    [...validMultipartParts(), { name: 'unknown', value: 'value' }],
    validMultipartParts().filter((part) => part.name !== 'certificate'),
    validMultipartParts().filter((part) => part.name !== 'password'),
    validMultipartParts().filter((part) => part.name !== 'purpose'),
    replaceMultipartPart({ name: 'certificate', value: new Uint8Array() }),
    replaceMultipartPart({ name: 'purpose', value: 'mdfe' }),
  ]
}

export function invalidPasswords(): readonly Uint8Array[] {
  return [
    new Uint8Array(),
    new TextEncoder().encode('x'.repeat(257)),
    new TextEncoder().encode(`${'é'.repeat(128)}x`),
    Uint8Array.from([0xc3, 0x28]),
  ]
}

export function invalidContentTypes(): readonly (readonly [string, Uint8Array])[] {
  return [
    ['text/plain', new TextEncoder().encode('not multipart')],
    ['multipart/form-data', multipartBytes(validMultipartParts())],
  ]
}

export function multipartBodyOfSize(byteLength: number): Uint8Array {
  const emptyBody = multipartBytes(
    replaceMultipartPart({ name: 'certificate', value: new Uint8Array() }),
  )
  return multipartBytes(
    replaceMultipartPart({
      name: 'certificate',
      value: new Uint8Array(byteLength - emptyBody.byteLength),
    }),
  )
}

export function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
        controller.enqueue(bytes.slice(offset, offset + 64 * 1024))
      }
      controller.close()
    },
  })
}

export function observedByteStream(input: {
  readonly bytes: Uint8Array
  readonly cancelError?: Error
}): {
  readonly body: ReadableStream<Uint8Array>
  readonly pulls: () => number
  readonly wasCancelled: () => boolean
} {
  let cancelled = false
  let offset = 0
  let pulls = 0
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        cancelled = true
        if (input.cancelError) throw input.cancelError
      },
      pull(controller) {
        pulls += 1
        const nextOffset = Math.min(offset + 64 * 1024, input.bytes.byteLength)
        controller.enqueue(input.bytes.slice(offset, nextOffset))
        offset = nextOffset
        if (offset === input.bytes.byteLength) controller.close()
      },
    },
    { highWaterMark: 0 },
  )
  return { body, pulls: () => pulls, wasCancelled: () => cancelled }
}
