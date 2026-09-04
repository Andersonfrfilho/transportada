/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { unknownTemplatePlaceholders } from '../domain/occurrence-template.policy.js'

/**
 * ⚠️ `stage` **não entra no corpo**: ele é derivado do tipo, e aceitá-lo do cliente deixaria quem
 * tem `trip.manage` declarar que uma ocorrência de rua é de galpão para caber na própria permissão.
 * O `strict()` é o que garante isso — um campo a mais é recusado, não ignorado.
 */
const registerOccurrenceSchema = z
  .object({
    note: z.string().trim().max(500).default(''),
    /** O tipo que a empresa cadastrou — conferido contra o cadastro dela, não contra uma lista. */
    occurrenceTypeId: z.string().uuid(),
    /** Vazio é a ocorrência da nota inteira: recusa total não tem item a apontar. */
    productCode: z.string().trim().max(60).default(''),
  })
  .strict()

export type RegisterOccurrenceBody = z.infer<typeof registerOccurrenceSchema>

export async function parseRegisterOccurrenceRequest(
  request: Request,
): Promise<RegisterOccurrenceBody> {
  return parseBody(registerOccurrenceSchema, request)
}

/**
 * O cadastro do tipo. ⚠️ `stage` é **obrigatório**: é ele que decide quem registra, e um padrão
 * escondido aqui daria permissão por omissão. O `strict()` recusa campo a mais — inclusive
 * `companyId` vindo do cliente.
 */
const occurrenceTypeSchema = z
  .object({
    active: z.boolean().default(true),
    /**
     * ⚠️ **Marcador desconhecido é recusado aqui, no cadastro.** Deixar passar faria o e-mail sair
     * com `{{numeroNF}}` cru para o cliente, e quem escreveu o modelo só descobriria pelo SAC dele.
     */
    emailBody: z
      .string()
      .max(4000)
      .default('')
      .refine((texto) => unknownTemplatePlaceholders(texto).length === 0, {
        message: 'UNKNOWN_TEMPLATE_PLACEHOLDER',
      }),
    emailSubject: z
      .string()
      .max(200)
      .default('')
      .refine((texto) => unknownTemplatePlaceholders(texto).length === 0, {
        message: 'UNKNOWN_TEMPLATE_PLACEHOLDER',
      }),
    /**
     * A chave do template do módulo de notificações que o tipo seleciona. Presente, ela é
     * conferida contra o catálogo da empresa na gravação, e assunto/corpo acima são ignorados.
     */
    emailTemplateKey: z.string().trim().min(1).max(120).nullable().default(null),
    name: z.string().trim().min(1).max(60),
    notifies: z.boolean().default(false),
    occurrenceTypeId: z.string().uuid().nullable().default(null),
    stage: z.enum(['delivery', 'separation']),
  })
  .strict()

export async function parseOccurrenceTypeRequest(
  request: Request,
): Promise<z.infer<typeof occurrenceTypeSchema>> {
  return parseBody(occurrenceTypeSchema, request)
}
