/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 e spec 247: os três textos do modelo de e-mail do tipo de ocorrência, cada um conferido com
 * a lista de marcadores do seu contexto. Compartilhado pelo cadastro do tipo e pela prévia, para as
 * duas fronteiras recusarem exatamente o mesmo texto.
 *
 * ⚠️ **Marcador desconhecido é recusado aqui, no cadastro.** Deixar passar faria o e-mail sair com
 * `{{numeroNF}}` cru para o cliente, e quem escreveu o modelo só descobriria pelo SAC dele.
 */
import { z } from 'zod'

import { OCCURRENCE_TEMPLATE_CONTEXT } from '../../shared/occurrence-template.constant.js'
import type { OccurrenceTemplateContext } from '../../shared/occurrence-template.constant.js'
import {
  OCCURRENCE_EMAIL_BODY_MAX_LENGTH,
  OCCURRENCE_EMAIL_SUBJECT_MAX_LENGTH,
  OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH,
} from '../../shared/trip-occurrence.constant.js'
import { unknownTemplatePlaceholders } from '../domain/occurrence-template.policy.js'

const UNKNOWN_TEMPLATE_PLACEHOLDER = 'UNKNOWN_TEMPLATE_PLACEHOLDER'

function buildTemplateTextSchema(params: {
  readonly context: OccurrenceTemplateContext
  readonly maxLength: number
}) {
  return z
    .string()
    .max(params.maxLength)
    .refine(
      (template) => unknownTemplatePlaceholders({ context: params.context, template }).length === 0,
      { message: UNKNOWN_TEMPLATE_PLACEHOLDER },
    )
}

export const emailSubjectTemplateSchema = buildTemplateTextSchema({
  context: OCCURRENCE_TEMPLATE_CONTEXT.subject,
  maxLength: OCCURRENCE_EMAIL_SUBJECT_MAX_LENGTH,
})

export const emailBodyTemplateSchema = buildTemplateTextSchema({
  context: OCCURRENCE_TEMPLATE_CONTEXT.body,
  maxLength: OCCURRENCE_EMAIL_BODY_MAX_LENGTH,
})

/** O formato de cada linha de item: marcadores de LINHA — `{{linhasItens}}` ali dentro seria recursão. */
export const emailItemLineTemplateSchema = buildTemplateTextSchema({
  context: OCCURRENCE_TEMPLATE_CONTEXT.itemLine,
  maxLength: OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH,
})
