/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 254: o app do motorista conta por que o envio falhou e quanto cada passo demorou. É só log
 * (sem tabela); o corpo é fechado campo a campo, então não há por onde entrar texto livre, URL
 * assinada ou coordenada. Sem `resolveDriver`: quem não tem cadastro de motorista também pode relatar.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { ApiError } from '../../shared/api.error.js'
import { API_ME_CLIENT_DIAGNOSTICS_PATH } from '../../shared/api.constant.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { createRecordClientDiagnosticsUseCase } from '../application/record-client-diagnostics.use-case.js'
import {
  CLIENT_DIAGNOSTICS_INVALID_CODE,
  CLIENT_DIAGNOSTICS_INVALID_MESSAGE,
  DIAGNOSTIC_APP_VERSION_PATTERN,
  DIAGNOSTIC_EFFECTIVE_TYPES,
  DIAGNOSTIC_EVENT_KINDS,
  DIAGNOSTIC_FAILURE_KINDS,
  DIAGNOSTIC_OPAQUE_KEY_PATTERN,
  DIAGNOSTIC_REPORT_KIND_PATTERN,
  DIAGNOSTIC_STEPS,
  MAX_DIAGNOSTIC_APP_VERSION_LENGTH,
  MAX_DIAGNOSTIC_ATTEMPT,
  MAX_DIAGNOSTIC_DEVICE_MEMORY_GB,
  MAX_DIAGNOSTIC_DURATION_MS,
  MAX_DIAGNOSTIC_EVENTS_PER_REQUEST,
  MAX_DIAGNOSTIC_HARDWARE_CONCURRENCY,
  MAX_DIAGNOSTIC_HTTP_STATUS,
  MAX_DIAGNOSTIC_KEY_LENGTH,
  MAX_DIAGNOSTIC_PHOTO_BYTES,
  MIN_DIAGNOSTIC_HTTP_STATUS,
} from '../domain/trip-client-diagnostics.constant.js'

const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const

const CLIENT_DIAGNOSTICS_RATE_LIMIT = {
  maxRequests: 6,
  scope: 'me-client-diagnostics',
  store: 'postgres',
  windowSeconds: 60,
} as const

const opaqueKeySchema = z
  .string()
  .max(MAX_DIAGNOSTIC_KEY_LENGTH)
  .regex(DIAGNOSTIC_OPAQUE_KEY_PATTERN)

const deviceSchema = z
  .object({
    appVersion: z
      .string()
      .max(MAX_DIAGNOSTIC_APP_VERSION_LENGTH)
      .regex(DIAGNOSTIC_APP_VERSION_PATTERN)
      .optional(),
    deviceMemoryGb: z.number().positive().max(MAX_DIAGNOSTIC_DEVICE_MEMORY_GB).optional(),
    effectiveType: z.enum(DIAGNOSTIC_EFFECTIVE_TYPES).optional(),
    hardwareConcurrency: z
      .number()
      .int()
      .positive()
      .max(MAX_DIAGNOSTIC_HARDWARE_CONCURRENCY)
      .optional(),
    isStandalone: z.boolean().optional(),
    saveData: z.boolean().optional(),
  })
  .strict()

const eventSchema = z
  .object({
    attachmentKey: opaqueKeySchema.optional(),
    attempt: z.number().int().min(0).max(MAX_DIAGNOSTIC_ATTEMPT).optional(),
    durationMs: z.number().int().min(0).max(MAX_DIAGNOSTIC_DURATION_MS).optional(),
    eventKind: z.enum(DIAGNOSTIC_EVENT_KINDS),
    failureKind: z.enum(DIAGNOSTIC_FAILURE_KINDS).optional(),
    httpStatus: z
      .number()
      .int()
      .min(MIN_DIAGNOSTIC_HTTP_STATUS)
      .max(MAX_DIAGNOSTIC_HTTP_STATUS)
      .optional(),
    idempotencyKey: opaqueKeySchema.optional(),
    occurredAt: z.iso.datetime(),
    photoBytes: z.number().int().min(0).max(MAX_DIAGNOSTIC_PHOTO_BYTES).optional(),
    reportKind: z.string().regex(DIAGNOSTIC_REPORT_KIND_PATTERN).optional(),
    step: z.enum(DIAGNOSTIC_STEPS),
  })
  .strict()

const bodySchema = z
  .object({
    device: deviceSchema.optional(),
    events: z.array(eventSchema).min(1).max(MAX_DIAGNOSTIC_EVENTS_PER_REQUEST),
  })
  .strict()

type ClientDiagnosticsBody = z.infer<typeof bodySchema>

export type MeClientDiagnosticsDependencies = { readonly logger: ApiLogger }

async function parseDiagnosticsBody(request: Request): Promise<ClientDiagnosticsBody> {
  try {
    return await parseBody(bodySchema, request)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 400) throw error

    throw new ApiError({
      code: CLIENT_DIAGNOSTICS_INVALID_CODE,
      ...(error.details === undefined ? {} : { details: error.details }),
      message: CLIENT_DIAGNOSTICS_INVALID_MESSAGE,
      status: 400,
    })
  }
}

export function createMeClientDiagnosticsRoutes(
  dependencies: MeClientDiagnosticsDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const useCase = createRecordClientDiagnosticsUseCase({ logger: dependencies.logger })

  return [
    defineRoute<ClientDiagnosticsBody>({
      handle({ context, input }): Promise<Response> {
        useCase.execute({
          companyId: context.scope.companyId,
          device: input.device,
          events: input.events,
          membershipId: context.scope.membershipId,
        })

        return Promise.resolve(new Response(null, { status: 204 }))
      },
      method: 'POST',
      parse: async ({ request }) => parseDiagnosticsBody(request),
      pathname: API_ME_CLIENT_DIAGNOSTICS_PATH,
      policy: REPORT_POLICY,
      rateLimit: CLIENT_DIAGNOSTICS_RATE_LIMIT,
    }),
  ]
}
