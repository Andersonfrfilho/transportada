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
  type OfficeForm,
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
  /** Repetido uma vez por item marcado — é assim que `FormData` carrega lista. */
  productCodes: 'productCodes',
  /**
   * Spec 166 (RF4): alinhados por índice a `productCodes` — a política pura confere o par e o
   * alinhamento (`occurrence-item-quantity.policy.ts`). Branco na posição é item sem contagem.
   */
  productQuantities: 'productQuantities',
  productQuantityUnits: 'productQuantityUnits',
  thumbnail: 'thumbnail',
} as const

const OCCURRENCE_MULTIPART_FIELDS = new Set<string>(Object.values(OCCURRENCE_MULTIPART_FIELD))

const OCCURRENCE_NOTE_MAX_LENGTH = 500
const OCCURRENCE_PRODUCT_CODE_MAX_LENGTH = 60

/**
 * O teto de itens de uma ocorrência. Uma nota com mais itens que isso marcados por inteiro é a nota
 * inteira — e é assim que ela deve ser registrada, com a lista vazia. O teto também impede que o
 * corpo cresça sem limite por um campo repetido.
 */
const OCCURRENCE_PRODUCT_CODES_LIMIT = 200

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
  readonly productCodes: readonly string[]
  /** Vazia é "ninguém mandou nada" — o alinhamento com `productCodes` é conferido na política. */
  readonly productQuantities: readonly string[]
  readonly productQuantityUnits: readonly string[]
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
    productCodes: parseOccurrenceProductCodes(form),
    productQuantities: parseOccurrenceRepeatedField(
      form,
      OCCURRENCE_MULTIPART_FIELD.productQuantities,
    ),
    productQuantityUnits: parseOccurrenceRepeatedField(
      form,
      OCCURRENCE_MULTIPART_FIELD.productQuantityUnits,
    ),
  }
}

/**
 * ⚠️ **Não filtra entrada vazia nem repetida.** As duas são recusadas com nome adiante
 * (`resolveOccurrenceProductSelection`, 422); limpá-las aqui transformaria o engano de quem marcou
 * numa ocorrência silenciosamente diferente da que ele viu na tela.
 */
function parseOccurrenceProductCodes(form: OfficeForm): readonly string[] {
  const values = form.getAll(OCCURRENCE_MULTIPART_FIELD.productCodes)
  if (values.length > OCCURRENCE_PRODUCT_CODES_LIMIT) throw new ApiError(HTTP_ERROR.invalidRequest)

  return values.map((value) => {
    if (typeof value !== 'string') throw new ApiError(HTTP_ERROR.invalidRequest)
    const trimmed = value.trim()
    if (trimmed.length > OCCURRENCE_PRODUCT_CODE_MAX_LENGTH) {
      throw new ApiError(HTTP_ERROR.invalidRequest)
    }
    return trimmed
  })
}

/** Cabe `"999999999.999"` (escala 3 do banco) sobrando espaço, e `"unit"`/`"box"` folgado. */
const OCCURRENCE_ITEM_QUANTITY_TOKEN_MAX_LENGTH = 32

/**
 * Spec 166 (RF4): `productQuantities`/`productQuantityUnits`, alinhados por índice a
 * `productCodes` — **preserva branco na posição**, ao contrário de `parseOccurrenceProductCodes`:
 * é assim que a política pura (`occurrence-item-quantity.policy.ts`) distingue "sem contagem" de
 * "desalinhado".
 */
function parseOccurrenceRepeatedField(form: OfficeForm, field: string): readonly string[] {
  const values = form.getAll(field)
  if (values.length > OCCURRENCE_PRODUCT_CODES_LIMIT) throw new ApiError(HTTP_ERROR.invalidRequest)

  return values.map((value) => {
    if (typeof value !== 'string') throw new ApiError(HTTP_ERROR.invalidRequest)
    const trimmed = value.trim()
    if (trimmed.length > OCCURRENCE_ITEM_QUANTITY_TOKEN_MAX_LENGTH) {
      throw new ApiError(HTTP_ERROR.invalidRequest)
    }
    return trimmed
  })
}

function parseOccurrenceMultipartText(value: OfficeFormValue, maxLength: number): string {
  if (value === null) return ''
  if (typeof value !== 'string') throw new ApiError(HTTP_ERROR.invalidRequest)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw new ApiError(HTTP_ERROR.invalidRequest)
  return trimmed
}

/**
 * Spec 161 T7 (RF6): o anexo adicional — lista fechada com **só** `file` (o original) e no máximo
 * um `thumbnail`, sem `note`/`occurrenceTypeId`/`productCode` (a ocorrência já existe). Mesmas
 * regras de bytes de `parseRegisterOccurrenceMultipartRequest`, sem o texto ao redor.
 */
const ATTACH_OCCURRENCE_MULTIPART_FIELD = {
  file: OFFICE_MULTIPART_FILE_FIELD,
  thumbnail: 'thumbnail',
} as const

const ATTACH_OCCURRENCE_MULTIPART_FIELDS = new Set<string>(
  Object.values(ATTACH_OCCURRENCE_MULTIPART_FIELD),
)

export type AttachOccurrencePhotoMultipartBody = {
  readonly attachment: RegisterOccurrenceMultipartAttachment
}

export async function parseAttachOccurrencePhotoRequest(
  request: Request,
): Promise<AttachOccurrencePhotoMultipartBody> {
  const form = await readOfficeMultipartForm({
    allowedFields: ATTACH_OCCURRENCE_MULTIPART_FIELDS,
    request,
  })
  if (form.getAll(ATTACH_OCCURRENCE_MULTIPART_FIELD.thumbnail).length > 1) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  const file = await readOfficeMultipartFile(form)
  if (file === null) throw new ApiError(HTTP_ERROR.invalidRequest)

  const thumbnailRaw = form.get(ATTACH_OCCURRENCE_MULTIPART_FIELD.thumbnail)
  let thumbnail: { readonly bytes: Uint8Array; readonly mimeType: string } | undefined
  if (thumbnailRaw !== null) {
    if (!(thumbnailRaw instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)
    thumbnail = {
      bytes: new Uint8Array(await thumbnailRaw.arrayBuffer()),
      mimeType: thumbnailRaw.type,
    }
  }

  return {
    attachment: { ...file, ...(thumbnail === undefined ? {} : { thumbnail }) },
  }
}

/**
 * O cadastro do tipo. ⚠️ `stage` é **obrigatório**: é ele que decide quem registra, e um padrão
 * escondido aqui daria permissão por omissão. O `strict()` recusa campo a mais — inclusive
 * `companyId` vindo do cliente.
 */
const occurrenceTypeSchema = z
  .object({
    active: z.boolean().default(true),
    /** Spec 166 (RF3/RF9): padrão `true` preserva o comportamento de hoje. */
    allowsMultipleItems: z.boolean().default(true),
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
