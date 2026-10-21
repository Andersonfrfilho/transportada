/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: os responsáveis por ocorrências, por item, em `/company-settings` e em `/contractors/:id`. Mesma
 * permissão dos contatos: `settings.manage`. `candidates` é rota estática; `:userId` só casa uuid.
 */
import { z } from 'zod'

import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_OCCURRENCE_WATCHER_CANDIDATES_PATH,
  API_COMPANY_OCCURRENCE_WATCHER_PATH,
  API_COMPANY_OCCURRENCE_WATCHERS_PATH,
  API_CONTRACTOR_OCCURRENCE_WATCHER_PATH,
  API_CONTRACTOR_OCCURRENCE_WATCHERS_PATH,
} from '../../shared/api.constant.js'
import type { OccurrenceWatchersUseCase } from '../application/occurrence-watchers.use-case.js'
import { OCCURRENCE_WATCHER_STATUSES } from '../domain/occurrence-watcher.constant.js'

const POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': 'application/json' }

const addSchema = z.object({ userId: z.string() }).strict()
const statusSchema = z.object({ status: z.enum(OCCURRENCE_WATCHER_STATUSES) }).strict()

type Scope = Readonly<{ contractorId?: string }>
type ScopeParameters = Readonly<Record<string, string | undefined>>

function readScope(parameters: ScopeParameters, isContractor: boolean): Scope {
  return isContractor ? { contractorId: parseUuidPathIdentifier(parameters.id ?? '') } : {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}

function buildScopeRoutes(params: {
  readonly collectionPath: string
  readonly isContractor: boolean
  readonly itemPath: string
  readonly useCase: OccurrenceWatchersUseCase
}) {
  const { collectionPath, isContractor, itemPath, useCase } = params
  return [
    defineRoute<Scope>({
      async handle({ context, input }) {
        return jsonResponse({ data: await useCase.list({ ...input, context: context.scope }) })
      },
      method: 'GET',
      parse: ({ pathParameters }) => readScope(pathParameters, isContractor),
      pathname: collectionPath,
      policy: POLICY,
    }),
    defineRoute<Scope & { correlationId: string; userId: string }>({
      async handle({ context, input }) {
        const { created, item } = await useCase.add({ ...input, context: context.scope })
        return jsonResponse({ data: item }, created ? 201 : 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(addSchema, request)
        return {
          ...readScope(pathParameters, isContractor),
          correlationId,
          userId: parseUuidPathIdentifier(body.userId),
        }
      },
      pathname: collectionPath,
      policy: POLICY,
    }),
    defineRoute<
      Scope & {
        correlationId: string
        status: (typeof OCCURRENCE_WATCHER_STATUSES)[number]
        userId: string
      }
    >({
      async handle({ context, input }) {
        return jsonResponse({ data: await useCase.setStatus({ ...input, context: context.scope }) })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(statusSchema, request)
        return {
          ...readScope(pathParameters, isContractor),
          correlationId,
          status: body.status,
          userId: parseUuidPathIdentifier(pathParameters.userId ?? ''),
        }
      },
      pathname: itemPath,
      policy: POLICY,
    }),
    defineRoute<Scope & { correlationId: string; userId: string }>({
      async handle({ context, input }) {
        await useCase.remove({ ...input, context: context.scope })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        ...readScope(pathParameters, isContractor),
        correlationId,
        userId: parseUuidPathIdentifier(pathParameters.userId ?? ''),
      }),
      pathname: itemPath,
      policy: POLICY,
    }),
  ]
}

export function createOccurrenceWatchersRoutes(dependencies: {
  readonly useCase: OccurrenceWatchersUseCase
}): readonly ReturnType<typeof defineRoute>[] {
  const { useCase } = dependencies
  return [
    ...buildScopeRoutes({
      collectionPath: API_COMPANY_OCCURRENCE_WATCHERS_PATH,
      isContractor: false,
      itemPath: API_COMPANY_OCCURRENCE_WATCHER_PATH,
      useCase,
    }),
    defineRoute<Record<string, never>>({
      async handle({ context }) {
        return jsonResponse({ data: await useCase.listCandidates({ context: context.scope }) })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_COMPANY_OCCURRENCE_WATCHER_CANDIDATES_PATH,
      policy: POLICY,
    }),
    ...buildScopeRoutes({
      collectionPath: API_CONTRACTOR_OCCURRENCE_WATCHERS_PATH,
      isContractor: true,
      itemPath: API_CONTRACTOR_OCCURRENCE_WATCHER_PATH,
      useCase,
    }),
  ]
}
