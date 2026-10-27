/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody, parseOption } from '../../http/request-parsing.service.js'
import {
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_PURPOSES,
  type DeliveryClientEmailPurpose,
} from '../../shared/delivery-client-email.constant.js'

/**
 * Spec 279 D4: forma do endereço, sem `\r\n,;<>` nem espaço — o que separa destinatário ou injeta
 * cabeçalho. É a mesma guarda de forma da CHECK do banco, não verificação de que a caixa existe.
 */
const ADDRESS_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/u

const purposeSchema = z.enum(DELIVERY_CLIENT_EMAIL_PURPOSES)
const labelSchema = z.string().trim().max(DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH)

const createSchema = z
  .object({
    address: z.string().trim().max(DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH).regex(ADDRESS_PATTERN),
    label: labelSchema.default(''),
    purpose: purposeSchema,
  })
  .strict()

const updateSchema = z.object({ label: labelSchema }).strict()

export async function parseCreateDeliveryClientEmail(request: Request): Promise<{
  readonly address: string
  readonly label: string
  readonly purpose: DeliveryClientEmailPurpose
}> {
  return parseBody(createSchema, request)
}

export async function parseUpdateDeliveryClientEmail(
  request: Request,
): Promise<{ readonly label: string }> {
  return parseBody(updateSchema, request)
}

/** `?type=` ausente lista todos os tipos; valor fora do vocabulário é `400`, não lista vazia. */
export function parseDeliveryClientEmailTypeFilter(url: URL): {
  readonly purpose?: DeliveryClientEmailPurpose
} {
  const purpose = parseOption(url.searchParams.get('type'), DELIVERY_CLIENT_EMAIL_PURPOSES)
  return purpose === undefined ? {} : { purpose }
}
