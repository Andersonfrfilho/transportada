/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5: o corpo que o escritório manda espelha o do motorista, com um campo a mais —
 * `driverId`, o motorista escolhido entre os da tripulação (ADR-0067 §2). Sem ele,
 * `resolveFieldTripTarget` cai no de `position = 1`.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseBody, parseOptionalBody } from '../../http/request-parsing.service.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../database/trip.schema.js'
import { DRIVER_RETURN_REASONS } from '../domain/driver-return-reason.policy.js'

export const OCCURRENCE_DESCRIPTION_MAX_LENGTH = 500

const driverSelectionSchema = z.object({ driverId: z.uuid().optional() }).strict()

/** ADR-0067 §3: exigido em `field-delivery`/`field-proof`, opcional em `field-return`. */
export const deliveredAtSchema = z.iso.datetime()

export function parseDeliveredAt(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}

const occurrenceSchema = z
  .object({
    description: z.string().max(OCCURRENCE_DESCRIPTION_MAX_LENGTH).optional(),
    /** ADR-0057 §3: `null`/ausente é não aferida, e ela é aceita — distância nunca é porteiro. */
    distanceMeters: z.int().min(0).nullish(),
    documentId: z.uuid().nullish(),
    driverId: z.uuid().optional(),
    kind: z.enum(TRIP_STOP_OCCURRENCE_KINDS),
  })
  .strict()

const arrivalSchema = z
  .object({
    /** Spec 156 T15 A1: quando a chegada aconteceu; ausente é agora (ADR-0067 §3). */
    arrivedAt: z.iso.datetime().optional(),
    driverId: z.uuid().optional(),
  })
  .strict()

/** `POST .../stops/:stopId/arrive`: corpo vazio, o motorista escolhido e/ou a hora da chegada. */
export async function parseOfficeArrivalRequest(request: Request): Promise<{
  readonly arrivedAt: Date | undefined
  readonly driverId: string | undefined
}> {
  const body = await parseOptionalBody(arrivalSchema, request)

  return {
    arrivedAt: body.arrivedAt === undefined ? undefined : parseDeliveredAt(body.arrivedAt),
    driverId: body.driverId,
  }
}

/** `confirm-load` e `start-route`: corpo vazio ou só o motorista escolhido. */
export async function parseOfficeDriverSelection(
  request: Request,
): Promise<{ readonly driverId: string | undefined }> {
  const body = await parseOptionalBody(driverSelectionSchema, request)

  return { driverId: body.driverId }
}

export async function parseOfficeStopOccurrenceRequest(request: Request): Promise<{
  readonly description: string
  readonly distanceMeters: number | null
  readonly documentId: string | null
  readonly driverId: string | undefined
  readonly kind: (typeof TRIP_STOP_OCCURRENCE_KINDS)[number]
}> {
  const body = await parseBody(occurrenceSchema, request)

  return {
    description: body.description ?? '',
    distanceMeters: body.distanceMeters ?? null,
    documentId: body.documentId ?? null,
    driverId: body.driverId,
    kind: body.kind,
  }
}

const officeReturnSchema = z
  .object({
    driverId: z.uuid().optional(),
    reason: z.enum(DRIVER_RETURN_REASONS),
    /** ADR-0067 §3: ausente cai em "agora" — as mesmas travas valem, e "agora" sempre as cumpre. */
    returnedAt: deliveredAtSchema.optional(),
  })
  .strict()

/** Spec 156 T6: `POST .../field-return` — corpo JSON, sem arquivo. */
export async function parseOfficeFieldReturnRequest(request: Request): Promise<{
  readonly driverId: string | undefined
  readonly reason: (typeof DRIVER_RETURN_REASONS)[number]
  readonly returnedAt: Date | undefined
}> {
  const body = await parseBody(officeReturnSchema, request)

  return {
    driverId: body.driverId,
    reason: body.reason,
    returnedAt: body.returnedAt === undefined ? undefined : parseDeliveredAt(body.returnedAt),
  }
}
