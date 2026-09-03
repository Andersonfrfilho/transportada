/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/**
 * ⚠️ `stage` **não entra no corpo**: ele é derivado do tipo, e aceitá-lo do cliente deixaria quem
 * tem `trip.manage` declarar que uma ocorrência de rua é de galpão para caber na própria permissão.
 * O `strict()` é o que garante isso — um campo a mais é recusado, não ignorado.
 */
const registerOccurrenceSchema = z
  .object({
    note: z.string().trim().max(500).default(''),
    /** Vazio é a ocorrência da nota inteira: recusa total não tem item. */
    productCode: z.string().trim().max(60).default(''),
    type: z.string().trim().min(1),
  })
  .strict()

export type RegisterOccurrenceBody = z.infer<typeof registerOccurrenceSchema>

export async function parseRegisterOccurrenceRequest(
  request: Request,
): Promise<RegisterOccurrenceBody> {
  return parseBody(registerOccurrenceSchema, request)
}

/** A escolha é por tipo, e o `strict()` recusa campo a mais — inclusive `companyId` do cliente. */
const occurrenceNotificationSchema = z
  .object({
    notifies: z.boolean(),
    type: z.string().trim().min(1),
  })
  .strict()

export async function parseOccurrenceNotificationRequest(
  request: Request,
): Promise<z.infer<typeof occurrenceNotificationSchema>> {
  return parseBody(occurrenceNotificationSchema, request)
}
