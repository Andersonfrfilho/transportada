/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF11: o endereço informado pelo operador é UM endereço. Recusa `\r`, `\n`, `,`, `;`, `<` e `>`
 * (injeção de cabeçalho, lista e "Nome <endereço>") antes de o `z.string().email()` ver o texto; tudo que
 * sobrar tem de ser um endereço só, com até 254 caracteres (RFC 5321).
 */
import { z } from 'zod'

import { CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH } from '../../shared/occurrence-contractor-reply.constant.js'

const UNSAFE_ADDRESS_CHARACTERS = /[\r\n,;<>]/u
const ADDRESS_SCHEMA = z.string().email()

/** `null` quando o texto não é um endereço único e seguro; senão o endereço sem as bordas em branco. */
export function parseContractorReplyEmailAddress(raw: string): null | string {
  const address = raw.trim()
  if (address.length === 0 || address.length > CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH) {
    return null
  }
  if (UNSAFE_ADDRESS_CHARACTERS.test(address)) return null
  if (!ADDRESS_SCHEMA.safeParse(address).success) return null
  return address
}
