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
  return [
    ...receiptRoutes,
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
