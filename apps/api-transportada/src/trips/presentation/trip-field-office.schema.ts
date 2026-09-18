/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5: o corpo que o escritório manda espelha o do motorista, com um campo a mais —
 * `driverId`, o motorista escolhido entre os da tripulação (ADR-0067 §2). Sem ele,
 * `resolveFieldTripTarget` cai no de `position = 1`.
 */
import { z } from 'zod'

import { parseBody, parseOptionalBody } from '../../http/request-parsing.service.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../database/trip.schema.js'

const OCCURRENCE_DESCRIPTION_MAX_LENGTH = 500

const driverSelectionSchema = z.object({ driverId: z.uuid().optional() }).strict()

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

/** `confirm-load`, `start-route` e `arrive`: corpo vazio ou só o motorista escolhido. */
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
