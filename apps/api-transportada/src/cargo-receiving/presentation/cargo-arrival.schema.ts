/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a fronteira da chegada. Corpo estrito (`companyId` no corpo é 400), no máximo 300
 * notas sem repetição, e a chave de idempotência ausente volta junto com os erros do corpo.
 */
import { z } from 'zod'

import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'
import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_LIMITS as LIMITS,
} from '../../shared/cargo-arrival.constant.js'
import type { RegisterCargoArrivalInput } from '../application/cargo-arrival-request.types.js'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
/** O teto da coluna `integer`: além disso o banco recusaria com 500. */
const PALLET_COUNT_MAX = 2_147_483_647

const documentIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(LIMITS.documentsPerRequest)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'A document is repeated' })

const registerCargoArrivalSchema = z
  .object({
    arrivedAt: z.iso.datetime({ offset: true }),
    contractorId: z.uuid(),
    documentIds: documentIdsSchema,
    palletCount: z.number().int().min(0).max(PALLET_COUNT_MAX).optional(),
    reference: z.string().trim().min(1).max(LIMITS.referenceMaxLength).optional(),
  })
  .strict()

export const batchCargoArrivalStatusSchema = z
  .object({
    documentIds: documentIdsSchema,
    to: z.enum([CARGO_ARRIVAL_DOCUMENT_STATE.received, CARGO_ARRIVAL_DOCUMENT_STATE.separated]),
  })
  .strict()

export const cargoArrivalRouteAssignmentSchema = z
  .object({
    documentIds: documentIdsSchema,
    routeName: z.string().trim().min(1).max(LIMITS.routeNameMaxLength).nullable(),
  })
  .strict()

export const emptyBodySchema = z.object({}).strict()

export type RegisterCargoArrivalRequest = {
  readonly idempotencyKey: string
  readonly input: RegisterCargoArrivalInput
}

export async function parseRegisterCargoArrivalRequest(
  request: Request,
): Promise<RegisterCargoArrivalRequest> {
  const key = readIdempotencyKey(request)
  const body = await parseBodyWithKeyIssue(request, key.issue)
  if (key.issue !== undefined) throw invalidRequest([key.issue])
  return {
    idempotencyKey: key.value,
    input: {
      arrivedAt: new Date(body.arrivedAt),
      contractorId: body.contractorId,
      documentIds: body.documentIds,
      palletCount: body.palletCount ?? null,
      reference: body.reference ?? null,
    },
  }
}

function readIdempotencyKey(request: Request): {
  readonly issue: ApiErrorDetail | undefined
  readonly value: string
} {
  const value = request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? ''
  if (IDEMPOTENCY_KEY.test(value)) return { issue: undefined, value }
  return {
    issue: { field: IDEMPOTENCY_KEY_HEADER, message: 'Use 16 to 256 of [A-Za-z0-9._:-]' },
    value,
  }
}

/** A chave que falta entra na mesma lista dos campos do corpo: todos os erros de uma vez. */
async function parseBodyWithKeyIssue(
  request: Request,
  keyIssue: ApiErrorDetail | undefined,
): Promise<z.infer<typeof registerCargoArrivalSchema>> {
  try {
    return await parseBody(registerCargoArrivalSchema, request)
  } catch (error) {
    if (keyIssue === undefined || !(error instanceof ApiError)) throw error
    throw invalidRequest([keyIssue, ...(error.details ?? [])])
  }
}
