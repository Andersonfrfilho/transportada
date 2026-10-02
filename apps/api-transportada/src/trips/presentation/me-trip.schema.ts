/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest, parseBody, parseOptionalBody } from '../../http/request-parsing.service.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../database/trip.schema.js'
import { DRIVER_RETURN_REASONS } from '../domain/driver-return-reason.policy.js'
import {
  CLOCK_OFFSET_LIMIT_MILLISECONDS,
  type EventClockFields,
} from '../domain/occurred-at.policy.js'
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

/**
 * Spec 232 D2/D6: a hora do toque no aparelho e o desvio dele para o servidor. Opcionais — cliente
 * antigo não os manda, e o `.strict()` de cada corpo continua recusando qualquer outra chave. Um sem
 * o outro vale: quem decide o que fazer é `resolveOccurredAt`, que trata como `missing`.
 */
const eventClockFields = {
  clockOffsetMs: z
    .int()
    .min(-CLOCK_OFFSET_LIMIT_MILLISECONDS)
    .max(CLOCK_OFFSET_LIMIT_MILLISECONDS)
    .optional(),
  tappedAt: z.iso.datetime().optional(),
}

const reportSchema = z.object({ ...eventClockFields, location: locationSchema.nullish() }).strict()

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
    ...eventClockFields,
    lateRegistration: lateRegistrationSchema,
    location: locationSchema.nullish(),
    reason: z.enum(DRIVER_RETURN_REASONS),
  })
  .strict()

const occurrenceBodySchema = z.object({
  ...eventClockFields,
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
})

/**
 * Spec 218 D2: um dos dois, nunca os dois — o tipo do catálogo (`flow: stop`, o kind sai do
 * `stop_kind` dele), ou o corpo antigo, que a fila gravou antes da troca e só conhecia o valor fixo.
 */
const occurrenceSchema = z.union([
  occurrenceBodySchema.extend({ occurrenceTypeId: z.uuid() }).strict(),
  occurrenceBodySchema.extend({ kind: z.enum(TRIP_STOP_OCCURRENCE_KINDS) }).strict(),
])

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

/** Chave ausente fica ausente: o projeto usa `exactOptionalPropertyTypes`, `undefined` explícito não vale. */
function toEventClock(body: {
  readonly clockOffsetMs?: number | undefined
  readonly tappedAt?: string | undefined
}): EventClockFields {
  return {
    ...(body.clockOffsetMs === undefined ? {} : { clockOffsetMs: body.clockOffsetMs }),
    ...(body.tappedAt === undefined ? {} : { tappedAt: new Date(body.tappedAt) }),
  }
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
): Promise<{ readonly location: ReportedLocation | null } & EventClockFields> {
  const body = await parseOptionalBody(reportSchema, request)

  return { ...toEventClock(body), location: toReportedLocation(body.location) }
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
export async function parseDocumentDeliveryRequest(request: Request): Promise<
  {
    readonly lateRegistration: boolean
    readonly location: ReportedLocation | null
  } & EventClockFields
> {
  const body = await parseOptionalBody(deliverySchema, request)

  return {
    ...toEventClock(body),
    lateRegistration: body.lateRegistration ?? false,
    location: toReportedLocation(body.location),
  }
}

export async function parseDocumentReturnRequest(request: Request): Promise<
  {
    readonly lateRegistration: boolean
    readonly location: ReportedLocation | null
    readonly reason: (typeof DRIVER_RETURN_REASONS)[number]
  } & EventClockFields
> {
  const body = await parseBody(returnSchema, request)

  return {
    ...toEventClock(body),
    lateRegistration: body.lateRegistration ?? false,
    location: toReportedLocation(body.location),
    reason: body.reason,
  }
}

export type StopOccurrenceRequest = {
  readonly attachmentObjectId: string | null
  readonly description: string
  readonly distanceMeters: number | null
  readonly documentId: string | null
} & EventClockFields &
  (
    | {
        readonly kind: (typeof TRIP_STOP_OCCURRENCE_KINDS)[number]
        readonly occurrenceTypeId?: undefined
      }
    | { readonly kind?: undefined; readonly occurrenceTypeId: string }
  )

export async function parseStopOccurrenceRequest(request: Request): Promise<StopOccurrenceRequest> {
  const body = await parseBody(occurrenceSchema, request)
  const common = {
    ...toEventClock(body),
    attachmentObjectId: body.attachmentObjectId ?? null,
    description: body.description ?? '',
    /* Ausente e nulo dizem a mesma coisa — não aferida —, e viram o mesmo valor aqui. */
    distanceMeters: body.distanceMeters ?? null,
    documentId: body.documentId ?? null,
  }

  return 'occurrenceTypeId' in body
    ? { ...common, occurrenceTypeId: body.occurrenceTypeId }
    : { ...common, kind: body.kind }
}
