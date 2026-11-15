/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { INTEGRATION_KEY_SCOPES } from '../../database/integration-api-key.schema.js'
import type { IntegrationKeyScope } from '../../database/integration-api-key.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'

const createKeySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z
      .array(z.enum(INTEGRATION_KEY_SCOPES))
      .min(1)
      .max(INTEGRATION_KEY_SCOPES.length)
      .refine((scopes) => new Set(scopes).size === scopes.length),
  })
  .strict()

export async function parseCreateIntegrationKey(
  request: Request,
): Promise<{ readonly name: string; readonly scopes: readonly IntegrationKeyScope[] }> {
  return parseBody(createKeySchema, request)
}
