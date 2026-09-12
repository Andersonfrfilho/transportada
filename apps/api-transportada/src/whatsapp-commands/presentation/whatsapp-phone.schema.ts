/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { WhatsAppPhoneInvalidError } from '../domain/whatsapp-phone.error.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'

const verificationRequestSchema = z.object({ phone: z.string() }).strict()

/** O número sai canônico daqui: é nessa forma que o pedido é gravado e buscado pelo `from`. */
export async function parseWhatsAppPhoneVerificationRequest(
  request: Request,
): Promise<{ readonly phone: string }> {
  const body = await parseBody(verificationRequestSchema, request)
  const phone = toWhatsAppPhone(body.phone)
  if (phone === undefined) throw new WhatsAppPhoneInvalidError()
  return { phone }
}
