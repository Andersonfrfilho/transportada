/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { CompanySettingsInput } from '../application/company-settings.port.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const DECIMAL_BIGINT = /^(?:[1-9][0-9]{0,18})$/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/
const MAX_DATABASE_BIGINT = 9_223_372_036_854_775_807n

type RequiredTextParams = {
  readonly maximum: number
  readonly minimum: number
}

const requiredText = ({ maximum, minimum }: RequiredTextParams) =>
  z.string().trim().min(minimum).max(maximum)
const optionalText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => value === '' || value.trim().length > 0)
const decimalBigint = z
  .string()
  .refine(isDatabaseBigint)
  .transform((value) => BigInt(value))

const profileSchema = z
  .object({
    city: requiredText({ maximum: 100, minimum: 2 }),
    cityIbgeCode: z.string().regex(/^\d{7}$/),
    cnpj: z.string().regex(/^\d{14}$/),
    complement: optionalText(100),
    district: requiredText({ maximum: 100, minimum: 1 }),
    email: optionalText(254),
    legalName: requiredText({ maximum: 200, minimum: 2 }),
    municipalRegistration: optionalText(20),
    number: requiredText({ maximum: 20, minimum: 1 }),
    phone: optionalText(20),
    postalCode: z.string().regex(/^\d{8}$/),
    rntrc: requiredText({ maximum: 20, minimum: 1 }),
    state: z.string().regex(/^[A-Z]{2}$/),
    stateRegistration: optionalText(20),
    street: requiredText({ maximum: 200, minimum: 2 }),
    taxRegime: z.enum(['1', '2', '3']),
    tradeName: optionalText(200),
  })
  .strict()

const settingsSchema = z
  .object({
    cte: z
      .object({
        environment: z.enum(['homologation', 'production']),
        nextNumber: decimalBigint,
        series: decimalBigint,
      })
      .strict(),
    expectedVersion: decimalBigint.nullable(),
    profile: profileSchema,
  })
  .strict()

export async function parseCompanySettingsRequest(request: Request): Promise<CompanySettingsInput> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const parsedJson = parseJson(body)
  const result = settingsSchema.safeParse(parsedJson)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

export function parseIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw new ApiError(HTTP_ERROR.invalidRequest)
  return value
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

function isDatabaseBigint(value: string): boolean {
  return DECIMAL_BIGINT.test(value) && BigInt(value) <= MAX_DATABASE_BIGINT
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
