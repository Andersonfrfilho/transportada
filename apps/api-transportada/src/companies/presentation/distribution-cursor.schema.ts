/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  DISTRIBUTION_CURSOR_NSU_PATTERN,
  distributionCursorInvalidNsu,
} from '../domain/distribution-cursor.error.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const adjustmentSchema = z.object({
  ultNsu: z.string().regex(DISTRIBUTION_CURSOR_NSU_PATTERN),
})

export type DistributionCursorAdjustment = {
  readonly ultNsu: string
}

export async function parseDistributionCursorAdjustment(
  request: Request,
): Promise<DistributionCursorAdjustment> {
  const parsed = adjustmentSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) throw distributionCursorInvalidNsu()
  return { ultNsu: parsed.data.ultNsu }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
