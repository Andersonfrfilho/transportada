/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { CONTRACTOR_AUTOMATION_XML_KINDS } from '../../database/contractor-automation.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'

/**
 * `.strict()`: a empresa vem do contexto. Os destinatários são e-mails simples (sem nome nem
 * `<>`), e a tela guia o resto: o máximo de 50 e o de 100 XMLs por parte são os do banco.
 */
const contractorAutomationSchema = z
  .object({
    billingDueDays: z.number().int().min(1).max(120).default(15),
    enabled: z.boolean().default(false),
    name: z.string().trim().min(1).max(120),
    nfseCity: z.string().trim().min(1).max(120).nullable().default(null),
    partSize: z.number().int().min(1).max(100).default(100),
    recipients: z.array(z.string().trim().toLowerCase().pipe(z.email().max(254))).max(50),
    xmlKind: z.enum(CONTRACTOR_AUTOMATION_XML_KINDS).default('cte'),
  })
  .strict()

export type ContractorAutomationBody = z.infer<typeof contractorAutomationSchema>

export function parseContractorAutomationBody(request: Request): Promise<ContractorAutomationBody> {
  return parseBody(contractorAutomationSchema, request)
}
