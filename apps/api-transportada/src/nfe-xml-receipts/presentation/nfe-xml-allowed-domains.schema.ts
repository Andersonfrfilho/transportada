/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { normalizeAllowedDomain } from '../domain/nfe-xml-allowed-domain.policy.js'

/** `.strict()`: a empresa vem do contexto autenticado, nunca do corpo. */
const releaseSchema = z
  .object({
    contractorId: z.uuid(),
    domain: z
      .string()
      .trim()
      .transform((value, context) => {
        const domain = normalizeAllowedDomain(value)
        if (domain === null) {
          context.addIssue({ code: 'custom', message: 'Invalid domain.' })
          return z.NEVER
        }
        return domain
      }),
  })
  .strict()

const statusSchema = z.object({ status: z.enum(['active', 'inactive']) }).strict()

export type ReleaseNfeXmlAllowedDomainBody = z.infer<typeof releaseSchema>

export function parseReleaseNfeXmlAllowedDomainBody(
  request: Request,
): Promise<ReleaseNfeXmlAllowedDomainBody> {
  return parseBody(releaseSchema, request)
}

export function parseNfeXmlAllowedDomainStatusBody(
  request: Request,
): Promise<z.infer<typeof statusSchema>> {
  return parseBody(statusSchema, request)
}
