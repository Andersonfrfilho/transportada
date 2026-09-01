/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'

const VIEW_KEY = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/
const MAX_VIEW_KEY_LENGTH = 120

const viewKeySchema = z.string().min(1).max(MAX_VIEW_KEY_LENGTH).regex(VIEW_KEY)

const saveViewPreferencesSchema = z
  .object({
    preferences: z.record(z.string(), z.unknown()),
    viewKey: viewKeySchema,
  })
  .strict()

export type SaveViewPreferencesRequest = {
  readonly preferences: Record<string, unknown>
  readonly viewKey: string
}

export function parseViewKeyQuery(request: Request): string {
  const viewKey = new URL(request.url).searchParams.get('viewKey')?.trim() ?? ''
  const result = viewKeySchema.safeParse(viewKey)
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

export async function parseSaveViewPreferencesRequest(
  request: Request,
): Promise<SaveViewPreferencesRequest> {
  assertJsonContentType(request.headers.get('content-type'))
  const body = await readBoundedRequestBody(request)
  const result = saveViewPreferencesSchema.safeParse(parseJson(body))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return { preferences: result.data.preferences, viewKey: result.data.viewKey }
}
