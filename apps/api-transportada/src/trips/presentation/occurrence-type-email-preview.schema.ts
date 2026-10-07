/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF4): o corpo da prévia do e-mail do tipo — os mesmos três textos do cadastro, conferidos
 * pelas mesmas listas de marcadores. O `strict()` recusa campo a mais, inclusive `companyId`.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import {
  emailBodyTemplateSchema,
  emailItemLineTemplateSchema,
  emailSubjectTemplateSchema,
} from './occurrence-template-fields.schema.js'

const occurrenceTypeEmailPreviewSchema = z
  .object({
    emailBody: emailBodyTemplateSchema.default(''),
    emailItemLineTemplate: emailItemLineTemplateSchema.default(''),
    emailSubject: emailSubjectTemplateSchema.default(''),
  })
  .strict()

export type OccurrenceTypeEmailPreviewBody = z.infer<typeof occurrenceTypeEmailPreviewSchema>

export async function parseOccurrenceTypeEmailPreviewRequest(
  request: Request,
): Promise<OccurrenceTypeEmailPreviewBody> {
  return parseBody(occurrenceTypeEmailPreviewSchema, request)
}
