/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest, parseBody, parseOptionalBody } from '../../http/request-parsing.service.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../database/trip.schema.js'
import { DRIVER_RETURN_REASONS } from '../domain/driver-return-reason.policy.js'
import type { ReportedLocation } from '../application/driver-field-report.port.js'

/**
 * A chave vem do aparelho e viaja no cabeçalho que o `apis.md` já exige em `POST` que cria recurso.
 * Sem ela a fila offline duplicaria entrega no primeiro reenvio — então ela é **obrigatória** aqui,
 * não opcional como no resto da API.
 */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'
const IDEMPOTENCY_KEY_MAX_LENGTH = 200
const OCCURRENCE_DESCRIPTION_MAX_LENGTH = 500

/**
 * Coordenada anulável **inteira**, nunca meia: latitude sem longitude é dado que mente. O aparelho
 * manda as duas ou não manda nenhuma, e não mandar é o caso normal do galpão sem sinal.
 */
const locationSchema = z
  .object({
    accuracyMeters: z.number().nonnegative().optional(),
    capturedAt: z.iso.datetime(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()

const reportSchema = z.object({ location: locationSchema.nullish() }).strict()

const returnSchema = z
  .object({
    location: locationSchema.nullish(),
    reason: z.enum(DRIVER_RETURN_REASONS),
  })
  .strict()

const occurrenceSchema = z
  .object({
    description: z.string().max(OCCURRENCE_DESCRIPTION_MAX_LENGTH).optional(),
    documentId: z.uuid().nullish(),
    kind: z.enum(TRIP_STOP_OCCURRENCE_KINDS),
  })
  .strict()

const dispatchCurrentTripSchema = z.object({ tripId: z.uuid() }).strict()

/** ADR-0058: a viagem vem no corpo — o snapshot já a entregou; o vínculo é conferido no caso de uso. */
export async function parseDispatchCurrentTripRequest(request: Request): Promise<string> {
  const body = await parseBody(dispatchCurrentTripSchema, request)

  return body.tripId
}

export function parseIdempotencyKey(request: Request): string {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)
  if (key === null || key.trim() === '' || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw invalidRequest([
      { field: IDEMPOTENCY_KEY_HEADER, message: 'A field report requires an idempotency key.' },
    ])
  }

  return key
}

/** A precisão vira texto decimal porque a coluna é `numeric` — `float` de precisão não é precisão. */
function toReportedLocation(
  value: z.infer<typeof locationSchema> | null | undefined,
): ReportedLocation | null {
  if (value === null || value === undefined) return null

  return {
    accuracyMeters: value.accuracyMeters === undefined ? null : value.accuracyMeters.toFixed(2),
    capturedAt: value.capturedAt,
    latitude: value.latitude.toFixed(7),
    longitude: value.longitude.toFixed(7),
  }
}

export async function parseFieldReportRequest(
  request: Request,
): Promise<{ readonly location: ReportedLocation | null }> {
  const body = await parseOptionalBody(reportSchema, request)

  return { location: toReportedLocation(body.location) }
}

export async function parseDocumentReturnRequest(request: Request): Promise<{
  readonly location: ReportedLocation | null
  readonly reason: (typeof DRIVER_RETURN_REASONS)[number]
}> {
  const body = await parseBody(returnSchema, request)

  return { location: toReportedLocation(body.location), reason: body.reason }
}

export async function parseStopOccurrenceRequest(request: Request): Promise<{
  readonly description: string
  readonly documentId: string | null
  readonly kind: (typeof TRIP_STOP_OCCURRENCE_KINDS)[number]
}> {
  const body = await parseBody(occurrenceSchema, request)

  return {
    description: body.description ?? '',
    documentId: body.documentId ?? null,
    kind: body.kind,
  }
}
