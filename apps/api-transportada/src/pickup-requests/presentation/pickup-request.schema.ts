/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  PICKUP_REQUEST_KINDS,
  PICKUP_REQUEST_STATUSES,
} from '../../database/pickup-request.schema.js'
import type { PickupRequestExtras } from '../application/pickup-request.port.js'
import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,256}$/
const BRAZILIAN_STATES = new Set(
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '),
)

const text = (max: number) => z.string().trim().min(1).max(max)

const addressSchema = z
  .object({
    city: text(120),
    cityIbgeCode: z
      .string()
      .regex(/^\d{7}$/)
      .nullable()
      .optional(),
    complement: z.string().trim().max(120).nullable().optional(),
    district: text(120),
    number: text(20),
    postalCode: z.string().regex(/^\d{8}$/),
    state: z
      .string()
      .length(2)
      .refine((value) => BRAZILIAN_STATES.has(value)),
    street: text(160),
  })
  .strict()
  .transform((value) => ({
    ...value,
    cityIbgeCode: value.cityIbgeCode ?? null,
    complement: value.complement ?? null,
  }))

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

const optionalPhone = z
  .string()
  .regex(/^\+?\d{10,15}$/)
  .nullable()
  .optional()

/** Spec 341: dados opcionais que o cliente pode somar ao pedido. */
const extrasShape = {
  accessNotes: optionalText(500),
  cargoValue: z
    .string()
    .regex(/^\d{1,15}(\.\d{1,4})?$/)
    .nullable()
    .optional(),
  destinationContactName: optionalText(120),
  destinationContactPhone: optionalPhone,
  originContactName: optionalText(120),
  originContactPhone: optionalPhone,
}

const createShape = {
  ...extrasShape,
  cargoDescription: text(500),
  destination: addressSchema,
  kind: z.enum(PICKUP_REQUEST_KINDS),
  note: z.string().trim().max(1000).nullable().optional(),
  origin: addressSchema,
  requesterEmail: z.string().trim().email().max(254).nullable().optional(),
  requesterName: text(120),
  requesterPhone: z
    .string()
    .regex(/^\+?\d{10,15}$/)
    .nullable()
    .optional(),
  volumes: z.number().int().positive().max(100000),
  weightKg: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,3})?$/)
    .refine((value) => Number(value) > 0),
  windowEnd: date,
  windowStart: date,
}

const CONTACT_REQUIRED = {
  message: 'contact',
  path: ['requesterEmail'],
}

const createSchema = z
  .object(createShape)
  .strict()
  .refine(
    (value) => (value.requesterEmail ?? null) !== null || (value.requesterPhone ?? null) !== null,
    CONTACT_REQUIRED,
  )

/**
 * Spec 340: o corpo do pedido que chega pela chave de integração. É o do portal mais quem pede (documento) e a
 * cotação que o cliente aceitou. O parceiro não tem sessão, então o documento é o que liga o pedido ao cadastro.
 */
const integrationSchema = z
  .object({
    ...createShape,
    quote: z
      .object({ total: z.string().regex(/^\d{1,15}(\.\d{1,4})?$/), validUntil: date })
      .strict()
      .nullable()
      .optional(),
    requesterTaxId: z.string().regex(/^(?:\d{11}|\d{14})$/),
  })
  .strict()
  .refine(
    (value) => (value.requesterEmail ?? null) !== null || (value.requesterPhone ?? null) !== null,
    CONTACT_REQUIRED,
  )

export type IntegrationPickupBody = CreatePickupRequestBody & {
  readonly quote: { readonly total: string; readonly validUntil: string } | null
  readonly requesterTaxId: string
}

export async function parseIntegrationPickupRequest(
  request: Request,
): Promise<IntegrationPickupBody> {
  const body = await parseBody(integrationSchema, request)
  return {
    ...toPickupExtras(body),
    cargoDescription: body.cargoDescription,
    destination: body.destination,
    kind: body.kind,
    note: body.note ?? null,
    origin: body.origin,
    quote: body.quote ?? null,
    requesterEmail: body.requesterEmail ?? null,
    requesterName: body.requesterName,
    requesterPhone: body.requesterPhone ?? null,
    requesterTaxId: body.requesterTaxId,
    volumes: body.volumes,
    weightKg: body.weightKg,
    windowEnd: body.windowEnd,
    windowStart: body.windowStart,
  }
}

export type CreatePickupRequestBody = PickupRequestExtras & {
  readonly cargoDescription: string
  readonly destination: z.output<typeof addressSchema>
  readonly kind: (typeof PICKUP_REQUEST_KINDS)[number]
  readonly note: string | null
  readonly origin: z.output<typeof addressSchema>
  readonly requesterEmail: string | null
  readonly requesterName: string
  readonly requesterPhone: string | null
  readonly volumes: number
  readonly weightKg: string
  readonly windowEnd: string
  readonly windowStart: string
}

export function toPickupExtras(body: z.output<typeof createSchema>): PickupRequestExtras {
  return {
    accessNotes: body.accessNotes ?? null,
    cargoValue: body.cargoValue ?? null,
    destinationContactName: body.destinationContactName ?? null,
    destinationContactPhone: body.destinationContactPhone ?? null,
    originContactName: body.originContactName ?? null,
    originContactPhone: body.originContactPhone ?? null,
  }
}

export async function parseCreatePickupRequest(request: Request): Promise<CreatePickupRequestBody> {
  const body = await parseBody(createSchema, request)
  return {
    ...toPickupExtras(body),
    cargoDescription: body.cargoDescription,
    destination: body.destination,
    kind: body.kind,
    note: body.note ?? null,
    origin: body.origin,
    requesterEmail: body.requesterEmail ?? null,
    requesterName: body.requesterName,
    requesterPhone: body.requesterPhone ?? null,
    volumes: body.volumes,
    weightKg: body.weightKg,
    windowEnd: body.windowEnd,
    windowStart: body.windowStart,
  }
}

export function parsePickupIdempotencyKey(value: string | null): string {
  if (value === null || !IDEMPOTENCY_KEY.test(value)) throw invalidRequest()
  return value
}

const acceptSchema = z
  .object({
    acceptedTotalAmount: z
      .string()
      .regex(/^\d{1,15}(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    acceptedWindowEnd: date.nullable().optional(),
    acceptedWindowStart: date.nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.acceptedWindowStart ?? null) === null ||
      (value.acceptedWindowEnd ?? null) === null ||
      (value.acceptedWindowEnd as string) >= (value.acceptedWindowStart as string),
    { message: 'window', path: ['acceptedWindowEnd'] },
  )

export async function parseAcceptPickupRequest(request: Request): Promise<{
  readonly acceptedTotalAmount: string | null
  readonly acceptedWindowEnd: string | null
  readonly acceptedWindowStart: string | null
  readonly note: string | null
}> {
  const body = await parseBody(acceptSchema, request)
  return {
    acceptedTotalAmount: body.acceptedTotalAmount ?? null,
    acceptedWindowEnd: body.acceptedWindowEnd ?? null,
    acceptedWindowStart: body.acceptedWindowStart ?? null,
    note: body.note ?? null,
  }
}

const refuseSchema = z.object({ note: z.string().trim().min(1).max(1000) }).strict()

export async function parseRefusePickupRequest(
  request: Request,
): Promise<{ readonly note: string }> {
  return parseBody(refuseSchema, request)
}

const scheduleSchema = z.object({ tripId: z.string().uuid() }).strict()

export async function parseSchedulePickupRequest(
  request: Request,
): Promise<{ readonly tripId: string }> {
  return parseBody(scheduleSchema, request)
}

export function parsePickupRequestListQuery(url: URL): {
  readonly status: (typeof PICKUP_REQUEST_STATUSES)[number] | undefined
} {
  const entries = [...url.searchParams.keys()]
  if (entries.some((key) => key !== 'status')) throw invalidRequest()
  const status = url.searchParams.get('status')
  if (status === null) return { status: undefined }
  if (!(PICKUP_REQUEST_STATUSES as readonly string[]).includes(status)) throw invalidRequest()
  return { status: status as (typeof PICKUP_REQUEST_STATUSES)[number] }
}
