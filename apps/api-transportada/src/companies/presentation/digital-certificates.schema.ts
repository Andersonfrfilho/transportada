/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { readCertificateMultipart } from './digital-certificates-multipart.service.js'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/
const UUID = z.uuid()
type MultipartForm = Awaited<ReturnType<Request['formData']>>

export type CertificateCursor = { readonly createdAt: Date; readonly id: string }

export async function parseCertificateForm(request: Request): Promise<{
  readonly certificate: Uint8Array
  readonly password: Uint8Array
  readonly purpose: 'cte'
}> {
  if (new URL(request.url).search !== '') throw invalidRequest()
  const { body, contentType } = await readCertificateMultipart(request)
  try {
    const form = await new Request(request.url, {
      body,
      headers: { 'content-type': contentType },
      method: 'POST',
    }).formData()
    return await parseForm(form)
  } finally {
    body.fill(0)
  }
}

export function parseCertificateIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw invalidRequest()
  return value
}

export function parseCertificateList(url: URL): {
  readonly cursor?: CertificateCursor
  readonly limit: number
} {
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => key !== 'cursor' && key !== 'limit')) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()
  const limitValue = url.searchParams.get('limit')
  const cursorValue = url.searchParams.get('cursor')
  return {
    ...(cursorValue === null ? {} : { cursor: parseCursor(cursorValue) }),
    limit: limitValue === null ? 25 : parseLimit(limitValue),
  }
}

async function parseForm(form: MultipartForm): Promise<{
  readonly certificate: Uint8Array
  readonly password: Uint8Array
  readonly purpose: 'cte'
}> {
  const entries = [...form.entries()]
  if (entries.length !== 3 || new Set(entries.map(([name]) => name)).size !== 3)
    throw invalidRequest()
  const certificate = form.get('certificate')
  const password = form.get('password')
  const purpose = form.get('purpose')
  if (
    !(certificate instanceof File) ||
    certificate.size === 0 ||
    typeof password !== 'string' ||
    purpose !== 'cte'
  )
    throw invalidRequest()
  const passwordBytes = new TextEncoder().encode(password)
  if (passwordBytes.byteLength < 1 || passwordBytes.byteLength > 256) {
    passwordBytes.fill(0)
    throw invalidRequest()
  }
  try {
    return {
      certificate: new Uint8Array(await certificate.arrayBuffer()),
      password: passwordBytes,
      purpose,
    }
  } catch (error) {
    passwordBytes.fill(0)
    throw error
  }
}

function parseLimit(value: string): number {
  if (!/^(?:[1-9]|[1-9][0-9]|100)$/.test(value)) throw invalidRequest()
  return Number(value)
}

function parseCursor(value: string): CertificateCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidRequest()
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    if (Buffer.from(decoded).toString('base64url') !== value) throw invalidRequest()
    const parsed: unknown = JSON.parse(decoded)
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string'
    )
      throw invalidRequest()
    const createdAt = new Date(parsed[0])
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== parsed[0] ||
      !UUID.safeParse(parsed[1]).success
    )
      throw invalidRequest()
    return { createdAt, id: parsed[1] }
  } catch {
    throw invalidRequest()
  }
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}
