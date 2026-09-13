/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

const MAX_SECRET_LENGTH = 500
const MAX_SENDER_NAME_LENGTH = 200
const MAX_SENDER_ADDRESS_LENGTH = 320
const MAX_REPLY_DOMAIN_LENGTH = 253

/**
 * `resposta.<domínio>` precisa ser subdomínio — o MX raiz é de outro serviço de e-mail (plan.md, "O
 * que já está no DNS"). Três rótulos é o piso: duas seções `dominio.com` já esgotaria o raiz.
 */
const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const REPLY_DOMAIN_PATTERN = new RegExp(`^${HOSTNAME_LABEL}(?:\\.${HOSTNAME_LABEL}){2,}$`)

/**
 * `apiKey`/`webhookSigningSecret` são opcionais de propósito: omiti-los mantém o segredo já selado
 * (T006 abre e sela de novo). O formato do `whsec_` é conferido pelo serviço de segredo, não aqui —
 * duas validações do mesmo prefixo divergiriam um dia.
 */
const saveContractorMailSettingsSchema = z
  .object({
    apiKey: z.string().min(1).max(MAX_SECRET_LENGTH).optional(),
    replyDomain: z
      .string()
      .trim()
      .toLowerCase()
      .max(MAX_REPLY_DOMAIN_LENGTH)
      .refine((value) => REPLY_DOMAIN_PATTERN.test(value), {
        message: 'must be a subdomain with at least three labels',
      }),
    senderAddress: z.string().trim().email().max(MAX_SENDER_ADDRESS_LENGTH),
    senderName: z.string().trim().min(1).max(MAX_SENDER_NAME_LENGTH),
    webhookSigningSecret: z.string().min(1).max(MAX_SECRET_LENGTH).optional(),
  })
  .strict()

export type SaveContractorMailSettingsBody = z.infer<typeof saveContractorMailSettingsSchema>

export function parseSaveContractorMailSettingsRequest(
  request: Request,
): Promise<SaveContractorMailSettingsBody> {
  return parseBody(saveContractorMailSettingsSchema, request)
}
