/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import {
  API_AGGREGATE_DOCUMENTS_PATH,
  HTTP_ERROR,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { AggregateDocumentReviewUseCase } from '../application/aggregate-document-review.use-case.js'
import type {
  AggregateDocument,
  AggregateDocumentForReview,
} from '../application/aggregate-document.port.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const REVIEW_PATH = `${API_AGGREGATE_DOCUMENTS_PATH}/:id/review`
const DOWNLOAD_PATH = `${API_AGGREGATE_DOCUMENTS_PATH}/:id/download`

const reviewSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    rejectionReason: z.string().trim().max(200).optional().default(''),
  })
  .strict()

async function parseReviewRequest(request: Request): Promise<{
  readonly decision: 'approved' | 'rejected'
  readonly rejectionReason: string
}> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = reviewSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

type Dependencies = {
  readonly aggregateDocumentReview: AggregateDocumentReviewUseCase
}

export function createAggregateDocumentReviewRoutes(dependencies: Dependencies) {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const documents = await dependencies.aggregateDocumentReview.list({
          context: context.scope,
        })
        return jsonResponse({ body: { data: documents.map(serialize) }, status: 200 })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_AGGREGATE_DOCUMENTS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly decision: 'approved' | 'rejected'
      readonly id: string
      readonly rejectionReason: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const document = await dependencies.aggregateDocumentReview.review({
          context: context.scope,
          decision: input.decision,
          id: input.id,
          rejectionReason: input.rejectionReason,
        })
        return jsonResponse({ body: { data: serializeDocument(document) }, status: 200 })
      },
      method: 'POST',
      parse: async ({ pathParameters, request }) => ({
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ...(await parseReviewRequest(request)),
      }),
      pathname: REVIEW_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const url = await dependencies.aggregateDocumentReview.getDownloadUrl({
          context: context.scope,
          id: input.id,
        })
        return jsonResponse({ body: { data: { url: url.toString() } }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: DOWNLOAD_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeDocument(document: AggregateDocument): object {
  return {
    createdAt: document.createdAt.toISOString(),
    id: document.id,
    rejectionReason: document.rejectionReason,
    status: document.status,
    type: document.type,
    updatedAt: document.updatedAt.toISOString(),
  }
}

function serialize(document: AggregateDocumentForReview): object {
  return {
    ...serializeDocument(document),
    divergences: document.divergences.map((divergence) => ({ ...divergence })),
    hasExtraction: document.hasExtraction,
    taxId: document.taxId,
  }
}
