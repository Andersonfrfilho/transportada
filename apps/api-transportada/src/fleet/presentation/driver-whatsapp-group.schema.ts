/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/** `1203630…@g.us` ou o formato antigo `5516…-1600…@g.us`. */
export const WHATSAPP_GROUP_JID_PATTERN = /^[0-9]+(?:-[0-9]+)?@g\.us$/u
const GROUP_NAME_MAX_LENGTH = 200

const setDriverWhatsappGroupBodySchema = z
  .object({
    groupJid: z.string().max(80).regex(WHATSAPP_GROUP_JID_PATTERN),
    groupName: z.string().trim().max(GROUP_NAME_MAX_LENGTH).default(''),
  })
  .strict()

export function parseSetDriverWhatsappGroupBody(request: Request): Promise<{
  readonly groupJid: string
  readonly groupName: string
}> {
  return parseBody(setDriverWhatsappGroupBodySchema, request)
}
