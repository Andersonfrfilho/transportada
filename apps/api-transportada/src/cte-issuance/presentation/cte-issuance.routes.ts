/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_CTE_BATCHES_PATH, HTTP_ERROR, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  parseIdempotencyKey,
  parseUuidPathIdentifier,
} from '../../cte-batches/presentation/cte-batch.schema.js'

const CTE_SUBMIT_POLICY = { permission: 'cte.submit', scope: 'company' } as const
/** Cancelar documento autorizado é irreversível na SEFAZ — não basta poder transmitir. */
const CTE_CANCEL_POLICY = { permission: 'cte.cancel', scope: 'company' } as const

type BatchIdentifierInput = {
  readonly batchId: string
}

type BatchItemIdentifierInput = BatchIdentifierInput & {
  readonly batchItemId: string
}

type IssueCteInput = BatchIdentifierInput & {
  readonly correlationId: string
  readonly idempotencyKey: string
}

type ReprocessCteInput = BatchItemIdentifierInput & {
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly reason?: string
}

type CancelCteInput = BatchItemIdentifierInput & {
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly justification: string
}

type WithContext<TInput> = TInput & {
  readonly context: CompanyContext
}

type CteIssuanceSummary = Readonly<Record<string, unknown>>

type CteDocumentPage = {
  readonly items: readonly CteIssuanceSummary[]
  readonly nextCursor: string | null
}

type Dependencies = {
  readonly cteIssuance: {
    readonly cancel: (input: WithContext<CancelCteInput>) => Promise<CteIssuanceSummary>
    readonly get: (input: WithContext<BatchItemIdentifierInput>) => Promise<CteIssuanceSummary>
    readonly issue: (input: WithContext<IssueCteInput>) => Promise<CteIssuanceSummary>
    readonly listDocuments: (
      input: WithContext<BatchItemIdentifierInput>,
    ) => Promise<CteDocumentPage>
    readonly reprocess: (input: WithContext<ReprocessCteInput>) => Promise<CteIssuanceSummary>
  }
}

/** Limites da tag xJust do evento 110111. */
const CANCELLATION_JUSTIFICATION_MIN_LENGTH = 15
const CANCELLATION_JUSTIFICATION_MAX_LENGTH = 255

const issueBodySchema = z.object({}).strict()
const cancelBodySchema = z
  .object({
    justification: z
      .string()
      .trim()
      .min(CANCELLATION_JUSTIFICATION_MIN_LENGTH)
      .max(CANCELLATION_JUSTIFICATION_MAX_LENGTH),
  })
  .strict()
const reprocessBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()

export function createCteIssuanceRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<IssueCteInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.cteIssuance.issue({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeIssue(result) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseIssueRequest(request)
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        }
      },
      pathname: `${API_CTE_BATCHES_PATH}/:id/issue`,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<ReprocessCteInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.cteIssuance.reprocess({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeReprocess(result) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseReprocessRequest(request)
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          batchItemId: parseUuidPathIdentifier(pathParameters.itemId ?? ''),
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        }
      },
      pathname: `${API_CTE_BATCHES_PATH}/:id/items/:itemId/reprocess`,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<CancelCteInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.cteIssuance.cancel({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeReprocess(result) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseCancelRequest(request)
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          batchItemId: parseUuidPathIdentifier(pathParameters.itemId ?? ''),
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          justification: body.justification,
        }
      },
      pathname: `${API_CTE_BATCHES_PATH}/:id/items/:itemId/cancel`,
      policy: CTE_CANCEL_POLICY,
    }),
    defineRoute<BatchItemIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.cteIssuance.get({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeIssuance(result) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => parseBatchItemPath(pathParameters),
      pathname: `${API_CTE_BATCHES_PATH}/:id/items/:itemId/issuance`,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<BatchItemIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.cteIssuance.listDocuments({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items.map(serializeDocument),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => parseBatchItemPath(pathParameters),
      pathname: `${API_CTE_BATCHES_PATH}/:id/items/:itemId/documents`,
      policy: CTE_SUBMIT_POLICY,
    }),
  ]
}

async function parseIssueRequest(request: Request): Promise<void> {
  const result = issueBodySchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
}

async function parseReprocessRequest(
  request: Request,
): Promise<{ readonly reason?: string | undefined }> {
  const result = reprocessBodySchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

async function parseCancelRequest(request: Request): Promise<{ readonly justification: string }> {
  const result = cancelBodySchema.safeParse(await parseJsonBody(request))
  if (!result.success) throw invalidRequest()
  return result.data
}

function parseBatchItemPath(
  pathParameters: Readonly<Record<string, string>>,
): BatchItemIdentifierInput {
  return {
    batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
    batchItemId: parseUuidPathIdentifier(pathParameters.itemId ?? ''),
  }
}

async function parseJsonBody(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.toLowerCase().split(';', 1)[0]?.trim() !==
    'application/json'
  ) {
    throw invalidRequest()
  }
  try {
    return await request.json()
  } catch {
    throw invalidRequest()
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeIssue(result: CteIssuanceSummary): object {
  return {
    batchId: result['batchId'],
    requestedAt: result['requestedAt'] ?? result['issueRequestedAt'],
    status: result['status'],
  }
}

function serializeReprocess(result: CteIssuanceSummary): object {
  return {
    attemptId: result['attemptId'],
    batchId: result['batchId'],
    batchItemId: result['batchItemId'],
    status: result['status'],
  }
}

function serializeIssuance(result: CteIssuanceSummary): object {
  return {
    accessKey: result['accessKey'],
    attemptId: result['attemptId'],
    batchId: result['batchId'],
    batchItemId: result['batchItemId'],
    environment: result['environment'] ?? result['fiscalEnvironment'],
    protocol: result['protocol'],
    reasonCause: result['reasonCause'] ?? getContextValue(result, 'reasonCause'),
    reasonCode: result['reasonCode'] ?? getContextValue(result, 'reasonCode'),
    status: result['status'],
    updatedAt: result['updatedAt'] ?? result['issueRequestedAt'],
  }
}

function serializeDocument(document: CteIssuanceSummary): object {
  return {
    accessKey: document['accessKey'],
    contentType: document['contentType'],
    documentId: document['documentId'],
    downloadUrl: document['downloadUrl'],
    expiresAt: document['expiresAt'],
    sha256: document['sha256'],
  }
}

function getContextValue(result: CteIssuanceSummary, key: string): unknown {
  const context = result['context']
  if (typeof context !== 'object' || context === null) return undefined
  return (context as Readonly<Record<string, unknown>>)[key]
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}
