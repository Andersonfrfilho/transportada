/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: forma dos corpos dos modelos. As variáveis (lista fechada por tipo) são conferidas
 * no caso de uso, que devolve o mesmo `400` com `details[]` por campo.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import {
  CONTRACTOR_MAIL_TEMPLATE_LIMITS,
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
} from '../domain/mail-template-catalog.constant.js'

const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/
const LINE_BREAK = /[\r\n]/u

const nameSchema = z.string().trim().min(1).max(CONTRACTOR_MAIL_TEMPLATE_LIMITS.name)
/** O assunto vira cabeçalho de e-mail: quebra de linha abriria injeção de cabeçalho. */
const subjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(CONTRACTOR_MAIL_TEMPLATE_LIMITS.subject)
  .refine((value) => !LINE_BREAK.test(value), { message: 'must be a single line' })
const requiredTextSchema = z.string().trim().min(1).max(CONTRACTOR_MAIL_TEMPLATE_LIMITS.text)
/** O texto de cada item pode ficar vazio: os blocos de endereço do layout já saem sozinhos. */
const itemTextSchema = z.string().trim().max(CONTRACTOR_MAIL_TEMPLATE_LIMITS.text)
const mailTypeSchema = z.enum(CONTRACTOR_MAIL_TEMPLATE_TYPES)
const versionSchema = z.string().regex(POSITIVE_BIGINT)

const contentShape = {
  closing: requiredTextSchema,
  intro: requiredTextSchema,
  itemText: itemTextSchema,
  subject: subjectSchema,
}

const createTemplateSchema = z
  .object({ mailType: mailTypeSchema, name: nameSchema, ...contentShape })
  .strict()

const CHANGE_KEYS = ['closing', 'intro', 'itemText', 'name', 'status', 'subject'] as const

const updateTemplateSchema = z
  .object({
    closing: requiredTextSchema.optional(),
    intro: requiredTextSchema.optional(),
    itemText: itemTextSchema.optional(),
    name: nameSchema.optional(),
    status: z.literal('archived').optional(),
    subject: subjectSchema.optional(),
    version: versionSchema,
  })
  .strict()
  .refine((body) => CHANGE_KEYS.some((key) => body[key] !== undefined), {
    message: 'must change at least one field',
  })

const setDefaultTemplateSchema = z.object({ version: versionSchema }).strict()

/** Prévia de um modelo salvo (`templateId`) ou do texto ainda não salvo (`mailType` + campos). */
const previewTemplateSchema = z
  .object({
    closing: requiredTextSchema.optional(),
    intro: requiredTextSchema.optional(),
    itemText: itemTextSchema.optional(),
    mailType: mailTypeSchema.optional(),
    subject: subjectSchema.optional(),
    templateId: z.uuid().optional(),
  })
  .strict()
  .superRefine((body, context) => {
    const contentKeys = ['closing', 'intro', 'itemText', 'mailType', 'subject'] as const
    if (body.templateId !== undefined) {
      for (const key of contentKeys) {
        if (body[key] !== undefined) {
          context.addIssue({ code: 'custom', message: 'not allowed with templateId', path: [key] })
        }
      }
      return
    }
    for (const key of contentKeys) {
      if (body[key] === undefined) {
        context.addIssue({ code: 'custom', message: 'required without templateId', path: [key] })
      }
    }
  })

export type CreateContractorMailTemplateBody = z.infer<typeof createTemplateSchema>
export type UpdateContractorMailTemplateBody = z.infer<typeof updateTemplateSchema>
export type SetDefaultContractorMailTemplateBody = z.infer<typeof setDefaultTemplateSchema>
export type PreviewContractorMailTemplateBody = z.infer<typeof previewTemplateSchema>

export function parseCreateContractorMailTemplateRequest(
  request: Request,
): Promise<CreateContractorMailTemplateBody> {
  return parseBody(createTemplateSchema, request)
}

export function parseUpdateContractorMailTemplateRequest(
  request: Request,
): Promise<UpdateContractorMailTemplateBody> {
  return parseBody(updateTemplateSchema, request)
}

export function parseSetDefaultContractorMailTemplateRequest(
  request: Request,
): Promise<SetDefaultContractorMailTemplateBody> {
  return parseBody(setDefaultTemplateSchema, request)
}

export function parsePreviewContractorMailTemplateRequest(
  request: Request,
): Promise<PreviewContractorMailTemplateBody> {
  return parseBody(previewTemplateSchema, request)
}
