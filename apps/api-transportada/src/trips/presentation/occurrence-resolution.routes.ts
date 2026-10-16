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
    note: z.string().trim().min(1).max(OCCURRENCE_RESOLUTION_NOTE_MAX_LENGTH),
  })
  .strict()

export type OccurrenceResolutionRoutesDependencies = {
  readonly resolveOccurrence: ResolveOccurrenceUseCase
}

type ResolveOccurrenceRouteInput = {
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
  return [
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
        return { note: body.note, occurrenceId, occurrenceKind }
      },
      pathParameterFormat: 'raw',
      pathname: OCCURRENCE_RESOLUTION_PATH,
      policy: OCCURRENCE_RESOLUTION_POLICY,
      rateLimit: OCCURRENCE_RESOLUTION_RATE_LIMIT,
    }),
  ]
}
