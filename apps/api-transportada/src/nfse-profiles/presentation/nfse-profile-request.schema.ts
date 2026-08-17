/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  MAX_DESCRIPTION_MAX_LENGTH,
  MIN_DESCRIPTION_MAX_LENGTH,
  MUNICIPALITY_NAME_MAX_LENGTH,
  NFSE_CREDENTIAL_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
  NFSE_ISS_EXIGIBILITIES,
  NFSE_TAKERS,
} from '../../database/nfse.schema.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'

const CNAE = /^[0-9]{7}$/
const IBGE_CITY = /^[0-9]{7}$/
const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/
const RATE_DECIMAL = /^(?:0\.[0-9]{6}|1\.000000)$/

const DEFAULT_DESCRIPTION_MAX_LENGTH = '2000'

const descriptionMaxLengthSchema = z
  .string()
  .regex(POSITIVE_BIGINT)
  .refine((value) => {
    const parsed = Number(value)
    return parsed >= MIN_DESCRIPTION_MAX_LENGTH && parsed <= MAX_DESCRIPTION_MAX_LENGTH
  })

const settingsSchema = z
  .object({
    chargeComponentLabel: z.string().trim().min(1).max(100),
    cnaeCode: z.string().regex(CNAE),
    descriptionMaxLength: descriptionMaxLengthSchema.default(DEFAULT_DESCRIPTION_MAX_LENGTH),
    descriptionTemplate: z.string().trim().min(1).max(MAX_DESCRIPTION_MAX_LENGTH),
    freightRuleId: z.uuid(),
    issExigibility: z.enum(NFSE_ISS_EXIGIBILITIES).default('1'),
    issRate: z.string().regex(RATE_DECIMAL),
    issWithheld: z.boolean().default(false),
    municipalTaxationCode: z.string().trim().max(40).default(''),
    municipalityIbgeCode: z.string().regex(IBGE_CITY),
    municipalityName: z.string().trim().min(1).max(MUNICIPALITY_NAME_MAX_LENGTH),
    name: z.string().trim().min(2).max(100),
    nbsCode: z.string().trim().max(40).default(''),
    observations: z.string().max(500).default(''),
    serviceListItem: z.string().trim().min(1).max(20),
    taker: z.enum(NFSE_TAKERS),
  })
  .strict()

export const createProfileSchema = settingsSchema

export const updateProfileSchema = z
  .object({
    expectedVersion: z.string().regex(POSITIVE_BIGINT),
    settings: settingsSchema,
  })
  .strict()

export const changeProfileStatusSchema = z
  .object({
    expectedVersion: z.string().regex(POSITIVE_BIGINT),
    status: z.enum(['active', 'inactive']),
  })
  .strict()

/**
 * `callbackToken` não entra: ele é gerado pelo servidor e rotacionado a cada gravação. Aceitar um
 * valor escolhido pelo cliente seria deixar o chamador definir o segredo da rota anônima.
 */
export const saveCredentialSchema = z
  .object({
    apiToken: z.string().min(1).max(4096),
    fiscalEnvironment: z.enum(NFSE_FISCAL_ENVIRONMENTS),
    // Vai no `X-AUTH-IM` de toda chamada: em branco o provedor responde 200 com `cadastro: null` e
    // a credencial só se revela inválida na primeira emissão, longe daqui.
    municipalRegistration: z.string().trim().min(1).max(40),
    status: z.enum(NFSE_CREDENTIAL_STATUSES).default('active'),
    taxId: buildTaxIdSchema(CNPJ_PATTERN),
  })
  .strict()
