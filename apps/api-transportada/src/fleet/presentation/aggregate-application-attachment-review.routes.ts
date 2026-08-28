/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  API_AGGREGATE_APPLICATION_ATTACHMENTS_PATH,
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
import { defineRoute } from '../../http/router.service.js'
import type { AggregateApplicationAttachmentReviewUseCase } from '../application/aggregate-application-attachment-review.use-case.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const ATTACHMENT_PATH = `${API_AGGREGATE_APPLICATION_ATTACHMENTS_PATH}/:attachmentId`
const REVIEW_PATH = `${ATTACHMENT_PATH}/review`
const DOWNLOAD_PATH = `${ATTACHMENT_PATH}/download`
const DOWNLOAD_EXPIRY_SECONDS = 300

const reviewSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    rejectionReason: z.string().trim().max(200).optional().default(''),
  })
  .strict()

type Dependencies = {
  readonly attachmentReview: AggregateApplicationAttachmentReviewUseCase
  readonly findDownloadLocation: (input: {
    readonly attachmentId: string
    readonly companyId: string
  }) => Promise<Readonly<{ bucket: string; objectKey: string }> | null>
  readonly createSignedDownload: (input: {
    readonly bucket: string
    readonly expiresInSeconds: number
    readonly key: string
  }) => Promise<URL>
}

export function createAggregateApplicationAttachmentReviewRoutes(dependencies: Dependencies) {
  return [
    defineRoute<{ readonly applicationId: string }>({
      async handle({ context, input }): Promise<Response> {
        const attachments = await dependencies.attachmentReview.list({
          applicationId: input.applicationId,
          context: { companyId: context.scope.companyId, userId: context.identity.userId },
        })
        return jsonResponse({ body: { data: attachments }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        applicationId: parseUuidPathIdentifier(pathParameters.applicationId ?? ''),
      }),
      pathname: API_AGGREGATE_APPLICATION_ATTACHMENTS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{
      readonly attachmentId: string
      readonly decision: 'approved' | 'rejected'
      readonly rejectionReason: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const attachment = await dependencies.attachmentReview.review({
          attachmentId: input.attachmentId,
          context: { companyId: context.scope.companyId, userId: context.identity.userId },
          decision: input.decision,
          rejectionReason: input.rejectionReason,
        })
        return jsonResponse({ body: { data: attachment }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        assertJsonContentType(request.headers.get('content-type'))
        const result = reviewSchema.safeParse(parseJson(await readBoundedRequestBody(request)))
        if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
        return {
          ...result.data,
          attachmentId: parseUuidPathIdentifier(pathParameters.attachmentId ?? ''),
        }
      },
      pathname: REVIEW_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{ readonly attachmentId: string }>({
      /** URL assinada de vida curta: o arquivo não é servido pela API, e o link não vira endereço. */
      async handle({ context, input }): Promise<Response> {
        const location = await dependencies.findDownloadLocation({
          attachmentId: input.attachmentId,
          companyId: context.scope.companyId,
        })
        if (location === null) throw new ApiError(HTTP_ERROR.notFound)

        const url = await dependencies.createSignedDownload({
          bucket: location.bucket,
          expiresInSeconds: DOWNLOAD_EXPIRY_SECONDS,
          key: location.objectKey,
        })
        return jsonResponse({ body: { data: { url: url.toString() } }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        attachmentId: parseUuidPathIdentifier(pathParameters.attachmentId ?? ''),
      }),
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
