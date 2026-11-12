/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { SALESPERSON_STATUSES } from '../../database/salesperson.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import { SALESPERSON_PORTFOLIO_MAX_CLIENTS } from '../domain/salesperson.constant.js'

/**
 * `.strict()`: a empresa e o ator vêm do contexto. E-mail e WhatsApp são opcionais um a um (a regra "ao menos um"
 * e a leitura do número moram no caso de uso, para o erro sair estável), mas texto vazio vale como ausente.
 */
const salespersonSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .transform((value) => (value === '' ? null : value))
      .pipe(z.email().nullable())
      .nullable()
      .default(null),
    name: z.string().trim().min(1).max(120),
    status: z.enum(SALESPERSON_STATUSES).default('active'),
    whatsapp: z
      .string()
      .trim()
      .max(40)
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .default(null),
  })
  .strict()

const portfolioSchema = z
  .object({
    taxIds: z
      .array(z.string().trim().toUpperCase().regex(TAX_ID_PATTERN))
      .max(SALESPERSON_PORTFOLIO_MAX_CLIENTS),
  })
  .strict()

export type SalespersonBody = z.infer<typeof salespersonSchema>
export type PortfolioBody = z.infer<typeof portfolioSchema>

export function parseSalespersonBody(request: Request): Promise<SalespersonBody> {
  return parseBody(salespersonSchema, request)
}

export function parsePortfolioBody(request: Request): Promise<PortfolioBody> {
  return parseBody(portfolioSchema, request)
}
