/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { CONTRACTOR_MAIL_MAX_RECIPIENTS } from '../../contractor-mail/domain/contractor-mail.constant.js'
import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import {
  BRAZILIAN_STATES,
  BRAZILIAN_STATE_IBGE_PREFIX,
} from '../domain/brazilian-state.constant.js'

const POSTAL_CODE_SEPARATORS = /[\s.\-/]/gu
const POSTAL_CODE_PATTERN = /^\d{8}$/u
const CITY_CODE_PATTERN = /^\d{7}$/u
const ADDRESS_KEY_PATTERN = /^\d*\|\d{8}\|[^|]{1,60}$/u

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum)
const optionalText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? ''
      return trimmed.length === 0 ? null : trimmed
    })

/**
 * RF3: CEP aceito com ou sem hífen, normalizado para 8 dígitos antes de validar a forma — quem
 * digitou `14020-210` e quem digitou `14020210` cometem o mesmo pedido.
 */
const postalCodeSchema = z
  .string()
  .transform((value) => value.replaceAll(POSTAL_CODE_SEPARATORS, ''))
  .pipe(z.string().regex(POSTAL_CODE_PATTERN))

const proposedAddressSchema = z
  .object({
    city: requiredText(255),
    cityCode: z.string().regex(CITY_CODE_PATTERN),
    complement: optionalText(255),
    district: optionalText(255),
    number: requiredText(20),
    postalCode: postalCodeSchema,
    state: z.enum(BRAZILIAN_STATES),
    street: requiredText(255),
  })
  .strict()
  /**
   * RF3: o `cityCode` IBGE de 7 dígitos precisa começar pelo prefixo de UF da própria UF proposta —
   * cruzado aqui, depois que os dois campos já passaram na forma individual, para aparecer junto
   * com qualquer outro erro do mesmo corpo em `details[]`.
   */
  .superRefine((value, context) => {
    if (!value.cityCode.startsWith(BRAZILIAN_STATE_IBGE_PREFIX[value.state])) {
      context.addIssue({
        code: 'custom',
        message: 'cityCode must start with the IBGE prefix of state',
        path: ['cityCode'],
      })
    }
  })

const putAddressCorrectionRequestSchema = z
  .object({
    proposed: proposedAddressSchema,
  })
  .strict()

export type ProposedAddressInput = z.infer<typeof proposedAddressSchema>

export async function parsePutAddressCorrectionRequestBody(
  request: Request,
): Promise<{ readonly proposed: ProposedAddressInput }> {
  return parseBody(putAddressCorrectionRequestSchema, request)
}

/**
 * A chave carrega `|` (`cityCode|postalCode|number`, `stop-address-key.ts`) — o cliente manda
 * codificada e o roteador (`pathParameterFormat: 'raw'`) a decodifica sem validar a forma.
 */
export function parseAddressCorrectionRequestKey(addressKey: string): string {
  if (!ADDRESS_KEY_PATTERN.test(addressKey)) throw invalidRequest()

  return addressKey
}

const uniqueArray = <TSchema extends z.ZodType<string>>(schema: TSchema, message: string) =>
  z
    .array(schema)
    .min(1)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', message })
      }
    })

/**
 * T304: `contactIds` marcados a cada envio (RF5a) — pelo menos um, no máximo o teto do Resend
 * (`CONTRACTOR_MAIL_MAX_RECIPIENTS`, cobrado de novo no gateway do worker). `requestIds` ausente é
 * o envio completo; presente é o unitário/seleção (RF6a) — os dois convergem no mesmo corpo.
 */
const postAddressCorrectionMailSchema = z
  .object({
    contactIds: uniqueArray(z.uuid(), 'contactIds must not repeat an id').max(
      CONTRACTOR_MAIL_MAX_RECIPIENTS,
    ),
    contractorTaxId: buildTaxIdSchema(TAX_ID_PATTERN),
    requestIds: uniqueArray(z.uuid(), 'requestIds must not repeat an id').optional(),
  })
  .strict()

export type PostAddressCorrectionMailBody = z.infer<typeof postAddressCorrectionMailSchema>

export async function parsePostAddressCorrectionMailBody(
  request: Request,
): Promise<PostAddressCorrectionMailBody> {
  return parseBody(postAddressCorrectionMailSchema, request)
}

/**
 * Revisão final (item de segurança B3): o CNPJ do emitente vem do **corpo**, nunca do caminho da
 * URL — é o que tira o documento fiscal de log de acesso, proxy e APM.
 */
const postAddressCorrectionRecipientsSchema = z
  .object({
    contractorTaxId: buildTaxIdSchema(TAX_ID_PATTERN),
  })
  .strict()

export type PostAddressCorrectionRecipientsBody = z.infer<
  typeof postAddressCorrectionRecipientsSchema
>

export async function parsePostAddressCorrectionRecipientsBody(
  request: Request,
): Promise<PostAddressCorrectionRecipientsBody> {
  return parseBody(postAddressCorrectionRecipientsSchema, request)
}
