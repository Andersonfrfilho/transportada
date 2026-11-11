/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316: os canais do vendedor. E-mail em minúsculas; WhatsApp em E.164 (a mesma leitura do número do cliente,
 * 281) mais a chave de comparação do celular com e sem o nono dígito (144). Ao menos um dos dois.
 */
import { parseClientWhatsAppNumber } from '../../occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import {
  SalespersonContactRequiredError,
  SalespersonWhatsAppInvalidError,
} from './salesperson.error.js'

export type SalespersonContact = {
  readonly email: string | null
  readonly whatsappE164: string | null
  readonly whatsappPhoneKey: string | null
}

export function resolveSalespersonContact(input: {
  readonly email: string | null
  readonly whatsapp: string | null
}): SalespersonContact {
  const email = input.email === null ? null : input.email.trim().toLowerCase()
  const rawWhatsapp = input.whatsapp === null ? null : input.whatsapp.trim()
  const hasEmail = email !== null && email.length > 0
  const hasWhatsapp = rawWhatsapp !== null && rawWhatsapp.length > 0
  if (!hasEmail && !hasWhatsapp) throw new SalespersonContactRequiredError()
  let whatsappE164: string | null = null
  if (hasWhatsapp) {
    whatsappE164 = parseClientWhatsAppNumber(rawWhatsapp)
    if (whatsappE164 === null) throw new SalespersonWhatsAppInvalidError()
  }

  return {
    email: hasEmail ? email : null,
    whatsappE164,
    whatsappPhoneKey: whatsappE164 === null ? null : toWhatsAppPhoneKey(whatsappE164.slice(1)),
  }
}
