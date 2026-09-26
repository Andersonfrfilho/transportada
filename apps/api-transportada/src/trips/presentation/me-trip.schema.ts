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

/**
 * Spec 205 RF1/RF2: o "Registrar entrega depois" da app do motorista. Opcional — ausente é o toque
 * na hora, e é o que todo cliente anterior ao campo manda.
 */
const lateRegistrationSchema = z.boolean().optional()

const reportSchema = z.object({ location: locationSchema.nullish() }).strict()

/**
 * Spec 206 D2/D18: o corpo de `depart` e de `cancel-departure` é o mesmo — `tappedAt` é a hora do
 * aparelho no toque, obrigatória (a rota é nova, sem cliente antigo a acomodar). Chave extra é
 * `400`: a sonda de deploy da T2.6 prova a rota existindo justamente por essa recusa.
 */
const departureSchema = z
  .object({ location: locationSchema.nullish(), tappedAt: z.iso.datetime() })
  .strict()

/** Só a baixa da nota aceita o registro tardio — a chegada continua recusando o campo. */
const deliverySchema = reportSchema.extend({ lateRegistration: lateRegistrationSchema }).strict()

const returnSchema = z
  .object({
    lateRegistration: lateRegistrationSchema,
    location: locationSchema.nullish(),
    reason: z.enum(DRIVER_RETURN_REASONS),
  })
  .strict()

const occurrenceSchema = z
  .object({
    /**
     * Spec 209 RF2: a foto do "Deu problema", em qualquer motivo — o id do upload confirmado da 179,
     * nunca o arquivo. Ausente é a ocorrência sem foto, que é o que todo cliente anterior manda.
     */
    attachmentObjectId: z.uuid().nullish(),
    description: z.string().max(OCCURRENCE_DESCRIPTION_MAX_LENGTH).optional(),
    /**
     * ADR-0057 §3: metros entre o motorista e a parada, medidos no aparelho. Ausente é **não
     * aferida** — parada sem coordenada, ou posição que nunca fixou —, e continua sendo aceita:
     * distância grande é informação para quem decide, nunca porteiro.
     */
    distanceMeters: z.int().min(0).nullish(),
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

/** Spec 206 D2/D18: `depart` e `cancel-departure` reusam o mesmo parser. */
export async function parseDepartureRequest(request: Request): Promise<{
  readonly location: ReportedLocation | null
  readonly tappedAt: Date
}> {
  const body = await parseBody(departureSchema, request)

  return { location: toReportedLocation(body.location), tappedAt: new Date(body.tappedAt) }
}

/** Spec 205 RF1: o corpo do `/deliver` — o da chegada mais o registro tardio. */
export async function parseDocumentDeliveryRequest(request: Request): Promise<{
  readonly lateRegistration: boolean
  readonly location: ReportedLocation | null
}> {
  const body = await parseOptionalBody(deliverySchema, request)

  return {
    lateRegistration: body.lateRegistration ?? false,
    location: toReportedLocation(body.location),
  }
}

export async function parseDocumentReturnRequest(request: Request): Promise<{
  readonly lateRegistration: boolean
  readonly location: ReportedLocation | null
  readonly reason: (typeof DRIVER_RETURN_REASONS)[number]
}> {
  const body = await parseBody(returnSchema, request)

  return {
    lateRegistration: body.lateRegistration ?? false,
    location: toReportedLocation(body.location),
    reason: body.reason,
  }
}

export async function parseStopOccurrenceRequest(request: Request): Promise<{
  readonly attachmentObjectId: string | null
  readonly description: string
  readonly distanceMeters: number | null
  readonly documentId: string | null
  readonly kind: (typeof TRIP_STOP_OCCURRENCE_KINDS)[number]
}> {
  const body = await parseBody(occurrenceSchema, request)

  return {
    attachmentObjectId: body.attachmentObjectId ?? null,
    description: body.description ?? '',
    /* Ausente e nulo dizem a mesma coisa — não aferida —, e viram o mesmo valor aqui. */
    distanceMeters: body.distanceMeters ?? null,
    documentId: body.documentId ?? null,
    kind: body.kind,
  }
}
