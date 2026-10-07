/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { REDELIVERY_POLICIES } from '../../database/trip.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { DECLARED_AMOUNT_DECIMAL } from '../../shared/money.constant.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import type { ReportedLocation } from '../application/driver-field-report.port.js'
import { locationSchema, toReportedLocation } from './reported-location.schema.js'
import { TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import {
  OCCURRENCE_DECLARED_AMOUNT_SCOPES,
  OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX,
  OCCURRENCE_MOMENTS,
  OCCURRENCE_PHOTO_MINIMUM_COUNT,
  OCCURRENCE_REFERENCE_NUMBER_PATTERN,
  OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH,
  OCCURRENCE_TYPE_FLOWS,
} from '../../shared/trip-occurrence.constant.js'
import { DELIVERY_PROOF_FIELD_MODES } from '../domain/delivery-proof-settings.policy.js'
import {
  emailBodyTemplateSchema,
  emailItemLineTemplateSchema,
  emailSubjectTemplateSchema,
} from './occurrence-template-fields.schema.js'
import {
  OFFICE_MULTIPART_FILE_FIELD,
  readOfficeMultipartFile,
  readOfficeMultipartForm,
  type OfficeForm,
  type OfficeFormValue,
} from './office-multipart.schema.js'

const OCCURRENCE_PRODUCT_CODE_MAX_LENGTH = 60

/**
 * O teto de itens de uma ocorrência. Uma nota com mais itens que isso marcados por inteiro é a nota
 * inteira — e é assim que ela deve ser registrada, com a lista vazia. O teto também impede que o
 * corpo cresça sem limite por um campo repetido.
 */
const OCCURRENCE_PRODUCT_CODES_LIMIT = 200

/** Spec 247 (T4.4): a quantidade devolvida — `numeric(12,3)`, texto, nunca número JSON. */
const OCCURRENCE_ITEM_QUANTITY_DECIMAL = /^\d{1,9}(\.\d{1,3})?$/
const NON_ZERO_DIGIT = /[1-9]/

const ITEMS_FIELD = 'items'
const DECLARED_AMOUNT_FIELD = 'declaredAmount'

/** Spec 247 (RF14): valor pago é texto com até duas casas — negativo, três casas ou número é `400`. */
const declaredAmountSchema = z.string().regex(DECLARED_AMOUNT_DECIMAL)

/**
 * Spec 247 (T4.4): um item marcado pelo motorista. **Sem preço e sem unidade**: os dois saem da nota
 * no servidor, e o `strict()` recusa quem tentar mandá-los.
 */
const driverOccurrenceItemSchema = z
  .object({
    declaredAmount: declaredAmountSchema.optional(),
    productCode: z.string().trim().min(1).max(OCCURRENCE_PRODUCT_CODE_MAX_LENGTH),
    quantity: z
      .string()
      .regex(OCCURRENCE_ITEM_QUANTITY_DECIMAL)
      .refine((quantity) => NON_ZERO_DIGIT.test(quantity)),
  })
  .strict()

/** Spec 247 (RF14): vazio é "não informado"; presente, só `[A-Za-z0-9 ./-]`, até 30. */
const referenceNumberSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(z.string().regex(new RegExp(OCCURRENCE_REFERENCE_NUMBER_PATTERN)).optional())

/**
 * ⚠️ `stage` **não entra no corpo**: ele é derivado do tipo, e aceitá-lo do cliente deixaria quem
 * tem `trip.manage` declarar que uma ocorrência de rua é de galpão para caber na própria permissão.
 * O `strict()` é o que garante isso — um campo a mais é recusado, não ignorado.
 */
const registerOccurrenceSchema = z
  .object({
    /**
     * Spec 179 T203 (RF2/RF2b): a referência ao upload já confirmado — nunca o arquivo. Ausente é
     * "sem anexo", recusado pelo caso de uso quando o tipo exige (`attachmentMode = 'required'`).
     */
    attachmentObjectId: z.string().uuid().optional(),
    /**
     * Spec 246 (T2.7): a **lista** de uploads confirmados (1 a 5, sem repetir), para o tipo que exige mais
     * de uma foto. Retrocompatível: o app antigo manda só o campo único acima, e mandar os dois juntos é
     * 400 — escolher um em silêncio gravaria o anexo que ninguém marcou.
     */
    attachmentObjectIds: z
      .array(z.string().uuid())
      .min(1)
      .max(OCCURRENCE_PHOTO_MINIMUM_COUNT.max)
      .optional(),
    /**
     * Spec 246 (RF9): a referência à assinatura já confirmada, pelo mesmo par `occurrence-uploads` +
     * `confirm` da 179 — nunca o arquivo. Ausente ou nula é "sem assinatura"; o tipo efetivo da nota
     * decide se isso é recusado (`TRIP_OCCURRENCE_SIGNATURE_REQUIRED`).
     */
    signatureObjectId: z.string().uuid().nullish(),
    /** Spec 196 T3.2: o ponto do toque; só a rota do motorista usa este schema. */
    location: locationSchema.nullish(),
    note: z.string().trim().max(500).default(''),
    /** O tipo que a empresa cadastrou — conferido contra o cadastro dela, não contra uma lista. */
    occurrenceTypeId: z.string().uuid(),
    /** Vazio é a ocorrência da nota inteira: recusa total não tem item a apontar. */
    productCode: z.string().trim().max(60).default(''),
    /** Spec 247 (T4.4): o valor pago da ocorrência; junto de valor em alguma linha é `400`. */
    declaredAmount: declaredAmountSchema.optional(),
    /** Spec 247 (T4.4): os itens com quantidade; junto de `productCode` é `400`. */
    items: z
      .array(driverOccurrenceItemSchema)
      .min(1)
      .max(OCCURRENCE_PRODUCT_CODES_LIMIT)
      .optional(),
    /** Spec 247 (T4.4): o número do documento do cliente. */
    referenceNumber: referenceNumberSchema.optional(),
  })
  .strict()
  .superRefine(refineAttachmentSelection)
  .superRefine(refineItemSelection)

/**
 * Spec 247 (T4.4): as duas formas de apontar produto (`productCode` antigo e `items` novo) e os dois
 * níveis do valor pago (ocorrência e linha) são **recusados juntos**, nunca reconciliados — escolher
 * um em silêncio gravaria o que ninguém marcou. Código repetido em `items` também é `400`.
 */
function refineItemSelection(
  body: {
    readonly declaredAmount?: string | undefined
    readonly items?: readonly z.infer<typeof driverOccurrenceItemSchema>[] | undefined
    readonly productCode: string
  },
  context: z.RefinementCtx,
): void {
  const items = body.items ?? []
  if (items.length === 0) return
  if (body.productCode !== '') {
    context.addIssue({ code: 'custom', message: 'ITEM_SELECTION_CONFLICT', path: [ITEMS_FIELD] })
  }
  const codes = items.map((item) => item.productCode)
  if (new Set(codes).size !== codes.length) {
    context.addIssue({ code: 'custom', message: 'ITEM_DUPLICATED', path: [ITEMS_FIELD] })
  }
  const hasLineAmount = items.some((item) => item.declaredAmount !== undefined)
  if (body.declaredAmount !== undefined && hasLineAmount) {
    context.addIssue({
      code: 'custom',
      message: 'DECLARED_AMOUNT_SELECTION_CONFLICT',
      path: [DECLARED_AMOUNT_FIELD],
    })
  }
}

function refineAttachmentSelection(
  body: {
    readonly attachmentObjectId?: string | undefined
    readonly attachmentObjectIds?: readonly string[] | undefined
    readonly signatureObjectId?: null | string | undefined
  },
  context: z.RefinementCtx,
): void {
  const { attachmentObjectId, attachmentObjectIds, signatureObjectId } = body
  const sentAttachmentIds = [
    ...(attachmentObjectId === undefined ? [] : [attachmentObjectId]),
    ...(attachmentObjectIds ?? []),
  ]
  if (
    signatureObjectId !== undefined &&
    signatureObjectId !== null &&
    sentAttachmentIds.includes(signatureObjectId)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'SIGNATURE_IS_ATTACHMENT',
      path: ['signatureObjectId'],
    })
  }
  if (attachmentObjectIds === undefined) return
  const hasBoth = attachmentObjectId !== undefined
  const hasDuplicate = new Set(attachmentObjectIds).size !== attachmentObjectIds.length
  if (hasBoth || hasDuplicate) {
    context.addIssue({
      code: 'custom',
      message: hasBoth ? 'ATTACHMENT_SELECTION_CONFLICT' : 'ATTACHMENT_DUPLICATED',
      path: ['attachmentObjectIds'],
    })
  }
}

export type RegisterOccurrenceBody = Omit<z.infer<typeof registerOccurrenceSchema>, 'location'> & {
  readonly location: ReportedLocation | null
}

export async function parseRegisterOccurrenceRequest(
  request: Request,
): Promise<RegisterOccurrenceBody> {
  const body = await parseBody(registerOccurrenceSchema, request)

  return { ...body, location: toReportedLocation(body.location) }
}

/**
 * Spec 179 T202 (RF2): o pedido de URL assinada de upload — só a forma declarada (tipo, tamanho).
 * `.strict()` pelo mesmo motivo do registro: campo extra é recusado, não ignorado.
 */
const createOccurrenceUploadSchema = z
  .object({
    mimeType: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().positive(),
  })
  .strict()

export type CreateOccurrenceUploadBody = z.infer<typeof createOccurrenceUploadSchema>

export async function parseCreateOccurrenceUploadRequest(
  request: Request,
): Promise<CreateOccurrenceUploadBody> {
  return parseBody(createOccurrenceUploadSchema, request)
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

/** Spec 247 (RF1): rótulo editável de um campo do registro — aparado, de 1 a 40 caracteres. */
const requirementLabelSchema = z.string().trim().min(1).max(OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH)

/**
 * O cadastro do tipo. ⚠️ `stage` é **obrigatório**: é ele que decide quem registra, e um padrão
 * escondido aqui daria permissão por omissão. O `strict()` recusa campo a mais — inclusive
 * `companyId` vindo do cliente.
 */
const occurrenceTypeSchema = z
  .object({
    active: z.boolean().default(true),
    /**
     * Spec 247 (RF1): o número do documento do cliente (ex.: a NFD) e o valor pago digitado, cada um
     * com modo, rótulo e (o valor) escopo. ⚠️ **Opcionais sem `default`, pelo mesmo motivo de
     * `attachmentMode`**: ausente é "não mexa" — um padrão escondido desligaria, a cada edição de
     * e-mail, o que a transportadora configurou.
     */
    declaredAmountLabel: requirementLabelSchema.optional(),
    declaredAmountMode: z.enum(DELIVERY_PROOF_FIELD_MODES).optional(),
    declaredAmountScope: z.enum(OCCURRENCE_DECLARED_AMOUNT_SCOPES).optional(),
    referenceNumberLabel: requirementLabelSchema.optional(),
    referenceNumberMode: z.enum(DELIVERY_PROOF_FIELD_MODES).optional(),
    /**
     * Spec 247 (RF5, RF6): o formato de cada linha de item do e-mail, conferido com os marcadores de
     * LINHA — `{{linhasItens}}` ali dentro seria recursão. Ausente é "não mexa"; vazio é a linha padrão.
     */
    emailItemLineTemplate: emailItemLineTemplateSchema.optional(),
    /**
     * Spec 166 (RF3/RF9), spec 246 T1c.3 (RF1b): um produto ou vários. ⚠️ **Opcional sem `default`,
     * pelo mesmo motivo de `attachmentMode`**: ausente é "não mexa" — um `default(true)` religaria
     * "vários" num tipo de produto único a cada edição que não toca o campo. A criação sem o campo
     * usa o padrão `true` da coluna.
     */
    allowsMultipleItems: z.boolean().optional(),
    /**
     * Spec 179 (RF1): se o registro do motorista exige comprovante — o mesmo vocabulário do
     * comprovante de entrega.
     *
     * ⚠️ **Opcional sem `default`, de propósito.** O UPDATE deste cadastro sobrescreve o registro
     * inteiro, e o editor do painel ainda não manda este campo: com `default('off')`, quem editasse
     * o texto do e-mail de um tipo marcado como `required` **desligaria a exigência de foto sem
     * erro nenhum** — o controle de compliance da spec caindo por uma edição que nada tem a ver com
     * ele. Ausente significa "não mexa", e quem grava resolve mantendo o valor atual.
     */
    attachmentMode: z.enum(DELIVERY_PROOF_FIELD_MODES).optional(),
    /**
     * Spec 241 (RF4), spec 246 (RF1b): se o tipo carrega produtos — `off`, `optional` ou `required`
     * (ao menos um produto, ou o mínimo abaixo). ⚠️ **Opcional sem `default`, pelo mesmo motivo de
     * `attachmentMode`**: ausente é "não mexa"; um `default('optional')` religaria o seletor de um
     * tipo `off` a cada edição.
     */
    itemsMode: z.enum(DELIVERY_PROOF_FIELD_MODES).optional(),
    /**
     * Spec 246 (RF1, RF3): a exigência da observação e da assinatura, no vocabulário do comprovante.
     * ⚠️ **Opcionais sem `default`, pelo mesmo motivo de `attachmentMode`**: ausente é "não mexa" — um
     * padrão escondido reescreveria, a cada edição de e-mail, o que a transportadora configurou.
     */
    noteMode: z.enum(DELIVERY_PROOF_FIELD_MODES).optional(),
    signatureMode: z.enum(DELIVERY_PROOF_FIELD_MODES).optional(),
    /**
     * Spec 246 (RF1c2): a quantidade mínima de produtos, lida só com `itemsMode = 'required'`. Nulo
     * é "todos os itens da nota" (a recusa total); ausente é "não mexa". Com outro modo o caso de
     * uso recusa (422).
     */
    itemsMinimumCount: z
      .number()
      .int()
      .min(1)
      .max(OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX)
      .nullable()
      .optional(),
    /**
     * Spec 246 (RF1c): a quantidade mínima de fotos, de 1 a 5, lida só com a foto `required`. Sem
     * `null` (o tipo nunca tem mínimo nulo); ausente é "não mexa".
     */
    photoMinimumCount: z
      .number()
      .int()
      .min(OCCURRENCE_PHOTO_MINIMUM_COUNT.min)
      .max(OCCURRENCE_PHOTO_MINIMUM_COUNT.max)
      .optional(),
    /**
     * Spec 183 T802: o tipo avisa a contratante sozinho no registro. Opcional sem `default` pelo
     * mesmo motivo do `attachmentMode`: ausente é "não mexa", nunca desligar o aviso de carona.
     */
    emailsContractor: z.boolean().optional(),
    /**
     * Spec 185 (RF6, ADR-0074 §4): "a viagem segue sem a nota" — só para tipo de separação
     * (`stage: 'separation'`); um tipo de entrega com `true` é recusado no caso de uso, 422.
     *
     * ⚠️ **Opcional sem `default`, pelo mesmo motivo de `attachmentMode` acima.** O UPDATE deste
     * cadastro sobrescreve o registro inteiro; com `default(false)`, editar o e-mail de um tipo
     * marcado "segue sem a nota" desligaria a marca sem erro nenhum. Ausente é "não mexa".
     */
    leavesDocumentBehind: z.boolean().optional(),
    /** Marcador desconhecido é recusado aqui, no cadastro — ver `occurrence-template-fields.schema.ts`. */
    emailBody: emailBodyTemplateSchema.default(''),
    emailSubject: emailSubjectTemplateSchema.default(''),
    /**
     * A chave do template do módulo de notificações que o tipo seleciona para o aviso interno. Presente,
     * ela é conferida contra o catálogo da empresa na gravação; assunto/corpo acima são o e-mail à
     * contratante, outro canal, e continuam gravados (spec 247 RF2).
     */
    emailTemplateKey: z.string().trim().min(1).max(120).nullable().default(null),
    /**
     * Spec 218 (D1, RF-B5): qual dos dois caminhos de registro este tipo alimenta. **Obrigatório
     * na criação** (`occurrenceTypeId: null`) — um tipo novo sem `flow` não sabe em qual botão do
     * motorista aparecer. Na edição, ausente é "não mexa", como `attachmentMode`: o UPDATE
     * sobrescreve o registro inteiro, e o editor do painel ainda não manda este campo.
     */
    flow: z.enum(OCCURRENCE_TYPE_FLOWS).optional(),
    /**
     * Spec 246 (RF0, T1b.1b): o conjunto de momentos do tipo. Presente, `stage`/`flow` gravados são
     * os derivados dele (o caso de uso os calcula); ausente é "não mexa" — o painel de hoje não manda.
     */
    moments: z.array(z.enum(OCCURRENCE_MOMENTS)).max(OCCURRENCE_MOMENTS.length).optional(),
    name: z.string().trim().min(1).max(60),
    notifies: z.boolean().default(false),
    occurrenceTypeId: z.string().uuid().nullable().default(null),
    /**
     * Spec 164 RF1/T21 (spec 242): a política de reentrega do tipo. Opcional sem `default`, pelo
     * mesmo motivo de `attachmentMode`: ausente é "não mexa", nunca zerar a política guardada.
     */
    redeliveryPolicy: z.enum(REDELIVERY_POLICIES).optional(),
    stage: z.enum(['delivery', 'separation']),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.occurrenceTypeId === null && data.flow === undefined) {
      ctx.addIssue({ code: 'custom', message: 'FLOW_REQUIRED_ON_CREATE', path: ['flow'] })
    }
  })

export async function parseOccurrenceTypeRequest(
  request: Request,
): Promise<z.infer<typeof occurrenceTypeSchema>> {
  return parseBody(occurrenceTypeSchema, request)
}

/**
 * Spec 218 RF-B3: o corpo do `PUT` de exceções por tipo — substituição total das duas listas,
 * mesmo padrão de `deliveryProofOverridesSchema`/`deliveryProofContractorOverridesSchema`.
 */
const attachmentOverrideModeSchema = z.enum(DELIVERY_PROOF_FIELD_MODES)

/**
 * Spec 246 (D-a, T2.4): na exceção, os cinco campos novos são **nulos e sem padrão** — nulo herda do
 * tipo, ausente é "não mexa" (nunca `?? 'x'` no `UPDATE`). `items_mode` e `items_minimum_count` vão
 * como par: mínimo só com `items_mode = 'required'` declarado ali mesmo, a mesma CHECK do banco —
 * recusada aqui com 400 em vez de virar 500.
 */
const overrideModeSchema = z.enum(DELIVERY_PROOF_FIELD_MODES).nullable().optional()

const overrideRequirementFields = {
  itemsMinimumCount: z
    .number()
    .int()
    .min(1)
    .max(OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX)
    .nullable()
    .optional(),
  itemsMode: overrideModeSchema,
  noteMode: overrideModeSchema,
  /** Spec 247 (D8): os dois modos novos — exigência, mesma natureza da foto e da observação. */
  declaredAmountMode: overrideModeSchema,
  referenceNumberMode: overrideModeSchema,
  photoMinimumCount: z
    .number()
    .int()
    .min(OCCURRENCE_PHOTO_MINIMUM_COUNT.min)
    .max(OCCURRENCE_PHOTO_MINIMUM_COUNT.max)
    .nullable()
    .optional(),
  signatureMode: overrideModeSchema,
}

function refineItemsMinimumPair(
  override: {
    readonly itemsMinimumCount?: null | number | undefined
    readonly itemsMode?: null | string | undefined
  },
  context: z.RefinementCtx,
): void {
  const hasMinimum = override.itemsMinimumCount !== null && override.itemsMinimumCount !== undefined
  if (hasMinimum && override.itemsMode !== 'required') {
    context.addIssue({
      code: 'custom',
      message: 'ITEMS_MINIMUM_REQUIRES_REQUIRED',
      path: ['itemsMinimumCount'],
    })
  }
}

export const occurrenceAttachmentOverridesSchema = z
  .object({
    contractorOverrides: z
      .array(
        z
          .object({
            attachmentMode: attachmentOverrideModeSchema,
            contractorId: z.string().uuid(),
            ...overrideRequirementFields,
          })
          .strict()
          .superRefine(refineItemsMinimumPair),
      )
      .max(200),
    recipientOverrides: z
      .array(
        z
          .object({
            attachmentMode: attachmentOverrideModeSchema,
            taxId: buildTaxIdSchema(TAX_ID_PATTERN),
            ...overrideRequirementFields,
          })
          .strict()
          .superRefine(refineItemsMinimumPair),
      )
      .max(200),
  })
  .strict()

export type OccurrenceAttachmentOverridesBody = z.infer<typeof occurrenceAttachmentOverridesSchema>

export async function parseOccurrenceAttachmentOverridesRequest(
  request: Request,
): Promise<OccurrenceAttachmentOverridesBody> {
  return parseBody(occurrenceAttachmentOverridesSchema, request)
}

/**
 * Spec 167 (RF2): `PATCH .../items` substitui o conjunto inteiro — o corpo manda o que passa a
 * valer, nunca `add`/`remove`. `code` é obrigatório; `quantity`/`unit` são opcionais e o par é
 * conferido pela política pura (`occurrence-item-quantity.policy.ts`), a mesma do registro.
 */
/**
 * Spec 247 (T4.8): na correção o número e os valores têm três estados — ausente mantém o gravado, nulo
 * limpa, texto passa a valer. Valor vazio limpa, como o número vazio do registro. Preço e unidade da nota
 * **não** entram: o `strict()` os recusa, e o servidor os lê da nota.
 */
const correctionReferenceNumberSchema = z.union([
  z.null(),
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.union([z.null(), z.string().regex(new RegExp(OCCURRENCE_REFERENCE_NUMBER_PATTERN))])),
])

const correctionDeclaredAmountSchema = declaredAmountSchema.nullable()

const correctOccurrenceItemsSchema = z
  .object({
    declaredAmount: correctionDeclaredAmountSchema.optional(),
    items: z
      .array(
        z
          .object({
            code: z.string().trim().min(1).max(60),
            declaredAmount: correctionDeclaredAmountSchema.optional(),
            quantity: z.string().trim().max(32).optional(),
            unit: z.string().trim().max(8).optional(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    referenceNumber: correctionReferenceNumberSchema.optional(),
  })
  .strict()

export type CorrectOccurrenceItemsBody = {
  /** Spec 247: ausente mantém, nulo limpa, texto passa a valer. */
  readonly declaredAmount?: null | string | undefined
  readonly productCodes: readonly string[]
  /** Alinhada por índice a `productCodes`; o mesmo significado dos três estados. */
  readonly productDeclaredAmounts: readonly (null | string | undefined)[]
  readonly productQuantities: readonly string[]
  readonly productQuantityUnits: readonly string[]
  readonly referenceNumber?: null | string | undefined
}

export async function parseCorrectOccurrenceItemsRequest(
  request: Request,
): Promise<CorrectOccurrenceItemsBody> {
  const body = await parseBody(correctOccurrenceItemsSchema, request)
  return {
    declaredAmount: body.declaredAmount,
    productCodes: body.items.map((item) => item.code),
    productDeclaredAmounts: body.items.map((item) => item.declaredAmount),
    productQuantities: body.items.map((item) => item.quantity ?? ''),
    productQuantityUnits: body.items.map((item) => item.unit ?? ''),
    referenceNumber: body.referenceNumber,
  }
}

/** Spec 167 (RF6): `reason` obrigatório — a política (`occurrence-cancellation.policy.ts`) confere teto e vazio. */
const cancelOccurrenceSchema = z.object({ reason: z.string() }).strict()

export async function parseCancelOccurrenceRequest(request: Request): Promise<{ reason: string }> {
  return parseBody(cancelOccurrenceSchema, request)
}
