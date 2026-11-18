/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: `POST /trip-occurrences/:kind/:id/resolution`, o escritório resolve a
 * ocorrência (nota ou parada) com uma observação obrigatória. A empresa vem do contexto, nunca do corpo.
 */
import { z } from 'zod'

import {
  invalidRequest,
  parseBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { OccurrenceKind } from '../application/occurrence-resolution.port.js'
import type { RecordDriverPayoutReceiptUseCase } from '../application/record-driver-payout-receipt.use-case.js'
import type { FindDriverAddressPointUseCase } from '../application/find-driver-address-point.use-case.js'
import type {
  SendDriverAddressToWhatsAppGroupUseCase,
  SendDriverResultToWhatsAppGroupUseCase,
} from '../application/send-driver-address-to-whatsapp-group.use-case.js'
import type { SendDriverPayoutReceiptByWhatsAppUseCase } from '../application/send-driver-payout-receipt-by-whatsapp.use-case.js'
import type { ResolveOccurrenceUseCase } from '../application/resolve-occurrence.use-case.js'

const OCCURRENCE_RESOLUTION_PATH = '/trip-occurrences/:kind/:id/resolution'
const OCCURRENCE_RESOLUTION_POLICY = {
  permission: 'occurrences.resolve',
  scope: 'company',
} as const
const OCCURRENCE_RESOLUTION_NOTE_MAX_LENGTH = 2000

const OCCURRENCE_RESOLUTION_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'trip-occurrence-resolution',
  store: 'postgres',
  windowSeconds: 300,
} as const

const resolveOccurrenceBodySchema = z
  .object({
    /** Spec 317 (E13): opcional; ausente é concluir como sempre. */
    driverPayoutReceiptAttachmentId: z.uuid().optional(),
    note: z.string().trim().min(1).max(OCCURRENCE_RESOLUTION_NOTE_MAX_LENGTH),
  })
  .strict()

const DRIVER_PAYOUT_RECEIPT_PATH = '/trip-occurrences/:kind/:id/driver-payout-receipt'
const DRIVER_PAYOUT_RECEIPT_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'trip-occurrence-driver-payout-receipt',
  store: 'postgres',
  windowSeconds: 300,
} as const

const driverPayoutReceiptBodySchema = z.object({ attachmentId: z.uuid() }).strict()

export type OccurrenceResolutionRoutesDependencies = {
  readonly recordDriverPayoutReceipt?: RecordDriverPayoutReceiptUseCase
  readonly findDriverAddressPoint?: FindDriverAddressPointUseCase
  readonly sendDriverAddressToWhatsAppGroup?: SendDriverAddressToWhatsAppGroupUseCase
  readonly sendDriverResultToWhatsAppGroup?: SendDriverResultToWhatsAppGroupUseCase
  readonly sendDriverPayoutReceiptByWhatsApp?: SendDriverPayoutReceiptByWhatsAppUseCase
  readonly resolveOccurrence: ResolveOccurrenceUseCase
}

type ResolveOccurrenceRouteInput = {
  readonly driverPayoutReceiptAttachmentId?: string
  readonly note: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
}

function parseOccurrenceKind(value: string | undefined): OccurrenceKind {
  if (value === 'document' || value === 'stop') return value
  throw invalidRequest([{ field: 'kind', message: 'Must be document or stop' }])
}

export function createOccurrenceResolutionRoutes(
  dependencies: OccurrenceResolutionRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const receiptRoutes = [
    ...(dependencies.recordDriverPayoutReceipt === undefined
      ? []
      : [createRecordDriverPayoutReceiptRoute(dependencies.recordDriverPayoutReceipt)]),
    ...(dependencies.sendDriverPayoutReceiptByWhatsApp === undefined
      ? []
      : [
          createSendDriverPayoutReceiptByWhatsAppRoute(
            dependencies.sendDriverPayoutReceiptByWhatsApp,
          ),
        ]),
  ]
  const addressRoutes =
    dependencies.sendDriverAddressToWhatsAppGroup === undefined
      ? []
      : [createSendDriverAddressToWhatsAppGroupRoute(dependencies.sendDriverAddressToWhatsAppGroup)]
  const resultRoutes =
    dependencies.sendDriverResultToWhatsAppGroup === undefined
      ? []
      : [createSendDriverResultToWhatsAppGroupRoute(dependencies.sendDriverResultToWhatsAppGroup)]
  return [
    ...receiptRoutes,
    ...addressRoutes,
    ...resultRoutes,
    ...(dependencies.findDriverAddressPoint === undefined
      ? []
      : [createFindDriverAddressPointRoute(dependencies.findDriverAddressPoint)]),
    defineRoute<ResolveOccurrenceRouteInput>({
      async handle({ context, input }): Promise<Response> {
        const resolved = await dependencies.resolveOccurrence.execute({
          context: context.scope,
          ...input,
        })
        return new Response(JSON.stringify({ data: resolved }), {
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
          status: 201,
        })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const occurrenceKind = parseOccurrenceKind(pathParameters.kind)
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const body = await parseBody(resolveOccurrenceBodySchema, request)
        return {
          ...(body.driverPayoutReceiptAttachmentId === undefined
            ? {}
            : { driverPayoutReceiptAttachmentId: body.driverPayoutReceiptAttachmentId }),
          note: body.note,
          occurrenceId,
          occurrenceKind,
        }
      },
      pathParameterFormat: 'raw',
      pathname: OCCURRENCE_RESOLUTION_PATH,
      policy: OCCURRENCE_RESOLUTION_POLICY,
      rateLimit: OCCURRENCE_RESOLUTION_RATE_LIMIT,
    }),
  ]
}

/** Spec 317 (E13): o comprovante da transferência ao motorista, sem concluir. Só ocorrência de parada. */
function createRecordDriverPayoutReceiptRoute(
  useCase: RecordDriverPayoutReceiptUseCase,
): ReturnType<typeof defineRoute> {
  return defineRoute<{ readonly attachmentId: string; readonly occurrenceId: string }>({
    async handle({ context, input }): Promise<Response> {
      const recorded = await useCase.execute({ ...input, context: context.scope })
      return new Response(JSON.stringify({ data: recorded }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
        status: 201,
      })
    },
    method: 'POST',
    async parse({ pathParameters, request }) {
      if (parseOccurrenceKind(pathParameters.kind) !== 'stop') {
        throw invalidRequest([
          { field: 'kind', message: 'Only stop occurrences have a payout receipt' },
        ])
      }
      const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
      const body = await parseBody(driverPayoutReceiptBodySchema, request)
      return { attachmentId: body.attachmentId, occurrenceId }
    },
    pathParameterFormat: 'raw',
    pathname: DRIVER_PAYOUT_RECEIPT_PATH,
    policy: OCCURRENCE_RESOLUTION_POLICY,
    rateLimit: DRIVER_PAYOUT_RECEIPT_RATE_LIMIT,
  })
}

const DRIVER_PAYOUT_RECEIPT_WHATSAPP_PATH =
  '/trip-occurrences/:kind/:id/driver-payout-receipt/whatsapp'
const DRIVER_PAYOUT_RECEIPT_WHATSAPP_RATE_LIMIT = {
  maxRequests: 20,
  scope: 'trip-occurrence-driver-payout-receipt-whatsapp',
  store: 'postgres',
  windowSeconds: 300,
} as const

/** Spec 317 (E13): manda o comprovante registrado ao WhatsApp do motorista pelo Evolution da empresa. Só parada. */
function createSendDriverPayoutReceiptByWhatsAppRoute(
  useCase: SendDriverPayoutReceiptByWhatsAppUseCase,
): ReturnType<typeof defineRoute> {
  return defineRoute<{ readonly occurrenceId: string }>({
    async handle({ context, input }): Promise<Response> {
      const sent = await useCase.execute({
        context: context.scope,
        occurrenceId: input.occurrenceId,
      })
      return new Response(JSON.stringify({ data: sent }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
        status: 201,
      })
    },
    method: 'POST',
    parse({ pathParameters }) {
      if (parseOccurrenceKind(pathParameters.kind) !== 'stop') {
        throw invalidRequest([
          { field: 'kind', message: 'Only stop occurrences have a payout receipt' },
        ])
      }
      return Promise.resolve({ occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') })
    },
    pathParameterFormat: 'raw',
    pathname: DRIVER_PAYOUT_RECEIPT_WHATSAPP_PATH,
    policy: OCCURRENCE_RESOLUTION_POLICY,
    rateLimit: DRIVER_PAYOUT_RECEIPT_WHATSAPP_RATE_LIMIT,
  })
}

const DRIVER_ADDRESS_WHATSAPP_GROUP_PATH =
  '/trip-occurrences/:kind/:id/driver-address/whatsapp-group'
const DRIVER_ADDRESS_ADDRESS_MAX_LENGTH = 300
const DRIVER_ADDRESS_WHATSAPP_GROUP_RATE_LIMIT = {
  maxRequests: 20,
  scope: 'trip-occurrence-driver-address-whatsapp-group',
  store: 'postgres',
  windowSeconds: 300,
} as const

const driverAddressBodySchema = z
  .object({
    addressText: z.string().trim().min(1).max(DRIVER_ADDRESS_ADDRESS_MAX_LENGTH),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((body) => (body.latitude === undefined) === (body.longitude === undefined), {
    message: 'latitude and longitude come together',
  })

/** Spec 343 (T6a): o endereço correto da entrega ao grupo de WhatsApp do motorista, pelo Evolution da empresa. */
function createSendDriverAddressToWhatsAppGroupRoute(
  useCase: SendDriverAddressToWhatsAppGroupUseCase,
): ReturnType<typeof defineRoute> {
  return defineRoute<{
    readonly addressText: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceKind
    readonly point?: { readonly latitude: number; readonly longitude: number }
  }>({
    async handle({ context, input }): Promise<Response> {
      const sent = await useCase.execute({ ...input, context: context.scope })
      return new Response(JSON.stringify({ data: sent }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
        status: 201,
      })
    },
    method: 'POST',
    async parse({ pathParameters, request }) {
      const occurrenceKind = parseOccurrenceKind(pathParameters.kind)
      const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
      const body = await parseBody(driverAddressBodySchema, request)
      return {
        addressText: body.addressText,
        occurrenceId,
        occurrenceKind,
        ...(body.latitude === undefined || body.longitude === undefined
          ? {}
          : { point: { latitude: body.latitude, longitude: body.longitude } }),
      }
    },
    pathParameterFormat: 'raw',
    pathname: DRIVER_ADDRESS_WHATSAPP_GROUP_PATH,
    policy: OCCURRENCE_RESOLUTION_POLICY,
    rateLimit: DRIVER_ADDRESS_WHATSAPP_GROUP_RATE_LIMIT,
  })
}

const DRIVER_RESULT_WHATSAPP_GROUP_PATH = '/trip-occurrences/:kind/:id/driver-result/whatsapp-group'
const DRIVER_RESULT_TEXT_MAX_LENGTH = 1000
const DRIVER_RESULT_WHATSAPP_GROUP_RATE_LIMIT = {
  maxRequests: 20,
  scope: 'trip-occurrence-driver-result-whatsapp-group',
  store: 'postgres',
  windowSeconds: 300,
} as const

const driverResultBodySchema = z
  .object({ text: z.string().trim().min(1).max(DRIVER_RESULT_TEXT_MAX_LENGTH) })
  .strict()

/** O resultado da ocorrência (decisão da contratante ou texto do escritório) ao grupo de WhatsApp do motorista. */
function createSendDriverResultToWhatsAppGroupRoute(
  useCase: SendDriverResultToWhatsAppGroupUseCase,
): ReturnType<typeof defineRoute> {
  return defineRoute<{
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceKind
    readonly text: string
  }>({
    async handle({ context, input }): Promise<Response> {
      const sent = await useCase.execute({ ...input, context: context.scope })
      return new Response(JSON.stringify({ data: sent }), {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
        status: 201,
      })
    },
    method: 'POST',
    async parse({ pathParameters, request }) {
      const occurrenceKind = parseOccurrenceKind(pathParameters.kind)
      const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
      const body = await parseBody(driverResultBodySchema, request)
      return { occurrenceId, occurrenceKind, text: body.text }
    },
    pathParameterFormat: 'raw',
    pathname: DRIVER_RESULT_WHATSAPP_GROUP_PATH,
    policy: OCCURRENCE_RESOLUTION_POLICY,
    rateLimit: DRIVER_RESULT_WHATSAPP_GROUP_RATE_LIMIT,
  })
}

const DRIVER_ADDRESS_POINT_PATH = '/trip-occurrences/driver-address/point'
const DRIVER_ADDRESS_POINT_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'trip-occurrence-driver-address-point',
  store: 'postgres',
  windowSeconds: 300,
} as const

const driverAddressPointBodySchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    district: z.string().trim().max(120).default(''),
    number: z.string().trim().max(20).default(''),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{8}$/u),
    state: z.string().trim().length(2),
    street: z.string().trim().min(1).max(200),
  })
  .strict()

/** Spec 343 (T6a): o ponto no mapa do endereço digitado (CEP incluso), para o pino do Google. 404 sem coordenada. */
function createFindDriverAddressPointRoute(
  useCase: FindDriverAddressPointUseCase,
): ReturnType<typeof defineRoute> {
  return defineRoute<z.infer<typeof driverAddressPointBodySchema>>({
    async handle({ input }): Promise<Response> {
      const point = await useCase.execute(input)
      return new Response(
        JSON.stringify(point === null ? { error: 'not_found' } : { data: point }),
        {
          headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
          status: point === null ? 404 : 200,
        },
      )
    },
    method: 'POST',
    parse: ({ request }) => parseBody(driverAddressPointBodySchema, request),
    pathname: DRIVER_ADDRESS_POINT_PATH,
    policy: OCCURRENCE_RESOLUTION_POLICY,
    rateLimit: DRIVER_ADDRESS_POINT_RATE_LIMIT,
  })
}
