/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320 RF2/D10: o escritório lista, libera e descarta os relatos do app que ficaram retidos. A empresa vem do
 * contexto, nunca do corpo. Permissão `occurrences.resolve` (escritório; nunca o separador nem o motorista).
 */
import { z } from 'zod'

import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type {
  DrizzleFieldReportHoldRepository,
  FieldReportHoldDisplay,
  FieldReportHoldRecord,
  FieldReportHoldSettings,
} from '../infrastructure/drizzle-field-report-hold.repository.js'
import {
  discardFieldReportHold,
  releaseFieldReportHold,
  type DecideFieldReportHoldDependencies,
} from '../application/decide-field-report-hold.use-case.js'

const FIELD_REPORT_HOLDS_PATH = '/field-report-holds'
const POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const
const RATE_LIMIT = {
  maxRequests: 60,
  scope: 'field-report-hold-decision',
  store: 'postgres',
  windowSeconds: 300,
} as const

const discardBodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict()

const SETTINGS_PATH = '/company-settings/field-report-hold'
const SETTINGS_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const settingsBodySchema = z.object({ enabled: z.boolean() }).strict()

export type FieldReportHoldRoutesDependencies = DecideFieldReportHoldDependencies & {
  /** O interruptor por empresa (D8): ligar e desligar é `settings.manage`, nunca a permissão de liberar. */
  readonly settings: Pick<DrizzleFieldReportHoldRepository, 'readSettings' | 'saveSettings'>
  readonly describeHolds?: (input: {
    readonly companyId: string
    readonly holds: readonly FieldReportHoldRecord[]
  }) => Promise<ReadonlyMap<string, FieldReportHoldDisplay>>
}

const NO_STORE = { 'cache-control': 'no-store', 'content-type': 'application/json' } as const

function settingsResponse(settings: FieldReportHoldSettings): Response {
  const data = { enabled: settings.enabled, updatedAt: settings.updatedAt?.toISOString() ?? null }

  return new Response(JSON.stringify({ data }), { headers: NO_STORE, status: 200 })
}

export function createFieldReportHoldRoutes(
  dependencies: FieldReportHoldRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.settings.readSettings(context.scope.companyId)

        return settingsResponse(settings)
      },
      method: 'GET',
      parse: () => ({}),
      pathname: SETTINGS_PATH,
      policy: SETTINGS_POLICY,
    }),
    defineRoute<{ readonly enabled: boolean }>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.settings.saveSettings({
          companyId: context.scope.companyId,
          enabled: input.enabled,
          userId: context.scope.userId,
        })

        return settingsResponse(settings)
      },
      method: 'PUT',
      parse: ({ request }) => parseBody(settingsBodySchema, request),
      pathname: SETTINGS_PATH,
      policy: SETTINGS_POLICY,
      rateLimit: { ...RATE_LIMIT, scope: 'field-report-hold-settings' },
    }),
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const holds = await dependencies.repository.list({
          companyId: context.scope.companyId,
          state: 'held',
        })

        const display = await dependencies.describeHolds?.({
          companyId: context.scope.companyId,
          holds,
        })
        const data = holds.map((hold) => ({
          ...hold,
          display: display?.get(hold.id) ?? { invoiceNumber: null, occurrenceTypeName: null },
        }))

        return new Response(JSON.stringify({ data }), { headers: NO_STORE, status: 200 })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: FIELD_REPORT_HOLDS_PATH,
      policy: POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const decided = await releaseFieldReportHold(dependencies, {
          companyId: context.scope.companyId,
          deciderUserId: context.scope.userId,
          id: input.id,
        })

        return new Response(JSON.stringify({ data: decided }), { headers: NO_STORE, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathParameterFormat: 'raw',
      pathname: `${FIELD_REPORT_HOLDS_PATH}/:id/release`,
      policy: POLICY,
      rateLimit: RATE_LIMIT,
    }),
    defineRoute<{ readonly id: string; readonly reason: null | string }>({
      async handle({ context, input }): Promise<Response> {
        const decided = await discardFieldReportHold(dependencies, {
          companyId: context.scope.companyId,
          deciderUserId: context.scope.userId,
          id: input.id,
          reason: input.reason,
        })

        return new Response(JSON.stringify({ data: decided }), { headers: NO_STORE, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(discardBodySchema, request)

        return {
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          reason: body.reason === undefined || body.reason === '' ? null : body.reason,
        }
      },
      pathParameterFormat: 'raw',
      pathname: `${FIELD_REPORT_HOLDS_PATH}/:id/discard`,
      policy: POLICY,
      rateLimit: RATE_LIMIT,
    }),
  ]
}
