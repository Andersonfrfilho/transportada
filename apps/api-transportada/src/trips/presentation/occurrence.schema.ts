/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { unknownTemplatePlaceholders } from '../domain/occurrence-template.policy.js'
import {
  OFFICE_MULTIPART_FILE_FIELD,
  readOfficeMultipartFile,
  readOfficeMultipartForm,
  type OfficeFormValue,
} from './office-multipart.schema.js'

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
 * Spec 161 T6 (RF5): a criação passou a ser **só** multipart — corpo JSON cai no `catch` de
 * `readOfficeMultipartForm` (não é `multipart/form-data`) e responde 400. Lista fechada:
 * `occurrenceTypeId`, `note`, `productCode`, exatamente um `file` (o original) e no máximo um
 * `thumbnail`. `file` é sempre exigido aqui — é o que faz `thumbnail` sem `file` responder 400
 * também, sem checagem própria: não existe caminho para mandar só a miniatura.
 */
const OCCURRENCE_MULTIPART_FIELD = {
  file: OFFICE_MULTIPART_FILE_FIELD,
  note: 'note',
  occurrenceTypeId: 'occurrenceTypeId',
  productCode: 'productCode',
  thumbnail: 'thumbnail',
} as const

const OCCURRENCE_MULTIPART_FIELDS = new Set<string>(Object.values(OCCURRENCE_MULTIPART_FIELD))

const OCCURRENCE_NOTE_MAX_LENGTH = 500
const OCCURRENCE_PRODUCT_CODE_MAX_LENGTH = 60

export type RegisterOccurrenceMultipartAttachment = {
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
}

export type RegisterOccurrenceMultipartBody = {
  readonly attachment: RegisterOccurrenceMultipartAttachment
  readonly note: string
  readonly occurrenceTypeId: string
  readonly productCode: string
}

export async function parseRegisterOccurrenceMultipartRequest(
  request: Request,
): Promise<RegisterOccurrenceMultipartBody> {
  const form = await readOfficeMultipartForm({
    allowedFields: OCCURRENCE_MULTIPART_FIELDS,
    request,
  })
  if (form.getAll(OCCURRENCE_MULTIPART_FIELD.thumbnail).length > 1) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const file = await readOfficeMultipartFile(form)
  if (file === null) throw new ApiError(HTTP_ERROR.invalidRequest)

  const thumbnailRaw = form.get(OCCURRENCE_MULTIPART_FIELD.thumbnail)
  let thumbnail: { readonly bytes: Uint8Array; readonly mimeType: string } | undefined
  if (thumbnailRaw !== null) {
    if (!(thumbnailRaw instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)
    thumbnail = {
      bytes: new Uint8Array(await thumbnailRaw.arrayBuffer()),
      mimeType: thumbnailRaw.type,
    }
  }

  const occurrenceTypeIdRaw = form.get(OCCURRENCE_MULTIPART_FIELD.occurrenceTypeId)
  if (typeof occurrenceTypeIdRaw !== 'string' || !z.uuid().safeParse(occurrenceTypeIdRaw).success) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return {
    attachment: { ...file, ...(thumbnail === undefined ? {} : { thumbnail }) },
    note: parseOccurrenceMultipartText(
      form.get(OCCURRENCE_MULTIPART_FIELD.note),
      OCCURRENCE_NOTE_MAX_LENGTH,
    ),
    occurrenceTypeId: occurrenceTypeIdRaw,
    productCode: parseOccurrenceMultipartText(
      form.get(OCCURRENCE_MULTIPART_FIELD.productCode),
      OCCURRENCE_PRODUCT_CODE_MAX_LENGTH,
    ),
  }
}

function parseOccurrenceMultipartText(value: OfficeFormValue, maxLength: number): string {
  if (value === null) return ''
  if (typeof value !== 'string') throw new ApiError(HTTP_ERROR.invalidRequest)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw new ApiError(HTTP_ERROR.invalidRequest)
  return trimmed
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
