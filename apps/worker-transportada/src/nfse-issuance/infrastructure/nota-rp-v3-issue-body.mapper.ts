/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { toIssRatePercentage } from './nfse-iss-rate-percentage.js'
import { stripPunctuation } from './nota-rp-v3-transport.js'
import type { NotaRpRejection } from './nota-rp-v2.client.js'

const TIME_ZONE = 'America/Sao_Paulo'
const SUPPORTED_ISS_EXIGIBILITY = '1'
const DESCRIPTION_LIMIT = 2000
const DECIMAL_TEXT = /^\d+(\.\d+)?$/u

export const PAYLOAD_REJECTION = {
  descriptionTooLong: 'NFSE_DESCRIPTION_TOO_LONG_FOR_PROVIDER',
  exigibilityUnsupported: 'NFSE_ISS_EXIGIBILITY_UNSUPPORTED',
  invalid: 'NFSE_PAYLOAD_INVALID',
  nationalTaxationCodeMissing: 'NFSE_NATIONAL_TAXATION_CODE_MISSING',
  simplesRateMissing: 'NFSE_SIMPLES_RATE_MISSING',
} as const

const decimalText = z.string().regex(DECIMAL_TEXT)

const payloadSchema = z.object({
  description: z.string().min(1),
  issExigibility: z.string(),
  issRate: decimalText,
  issWithheld: z.boolean(),
  municipalTaxationCode: z.string().optional(),
  municipalityIbgeCode: z.string().min(1),
  nationalTaxationCode: z.string().min(1),
  nbsCode: z.string().optional(),
  serviceAmount: decimalText,
  simplesNationalRate: decimalText,
  taker: z.object({
    address: z
      .object({
        city: z.string(),
        complement: z.string().optional(),
        district: z.string(),
        number: z.string(),
        phone: z.string().optional(),
        postalCode: z.string(),
        state: z.string(),
        street: z.string(),
      })
      .optional(),
    legalName: z.string().min(1),
    taxId: z.string().min(1),
  }),
})

type IssuePayload = z.infer<typeof payloadSchema>

export type IssueBodyResult =
  | { readonly body: Readonly<Record<string, unknown>>; readonly kind: 'body' }
  | { readonly kind: 'rejected'; readonly rejection: NotaRpRejection }

export type BuildIssueBodyParams = {
  readonly callbackBaseUrl: string
  readonly callbackToken: string
  readonly issuedAt: Date
  readonly payload: Readonly<Record<string, unknown>>
  readonly providerDocumentId: string | undefined
  readonly providerRequestKey: string
}

export function buildIssueBody(params: BuildIssueBodyParams): IssueBodyResult {
  const named = findNamedRejection(params.payload)
  if (named !== undefined) return rejected(named.code, named.message)

  const parsed = payloadSchema.safeParse(params.payload)
  if (!parsed.success)
    return rejected(PAYLOAD_REJECTION.invalid, 'Payload da NFS-e fora do formato.')

  const payload = parsed.data
  if (payload.issExigibility !== SUPPORTED_ISS_EXIGIBILITY) {
    return rejected(PAYLOAD_REJECTION.exigibilityUnsupported, 'Exigibilidade do ISS sem par na v3.')
  }
  if (payload.description.length > DESCRIPTION_LIMIT) {
    return rejected(
      PAYLOAD_REJECTION.descriptionTooLong,
      'Descrição maior que o limite do provedor.',
    )
  }

  const reissueId = readReissueId(params.providerDocumentId)
  if (reissueId === null) return rejected(PAYLOAD_REJECTION.invalid, 'id_nota fora do formato.')

  return {
    body: {
      flags: buildFlags(params),
      servico: buildService({ issuedAt: params.issuedAt, payload }),
      tomador: buildTaker(payload.taker),
      ...(reissueId === undefined ? {} : { id_nota: reissueId }),
    },
    kind: 'body',
  }
}

function rejected(code: string, message: string): IssueBodyResult {
  return { kind: 'rejected', rejection: { code, message } }
}

function findNamedRejection(
  payload: Readonly<Record<string, unknown>>,
): NotaRpRejection | undefined {
  const nationalCode = payload['nationalTaxationCode']
  if (typeof nationalCode !== 'string' || nationalCode.length === 0) {
    return {
      code: PAYLOAD_REJECTION.nationalTaxationCodeMissing,
      message: 'Payload sem o código de tributação nacional.',
    }
  }
  const simplesRate = payload['simplesNationalRate']
  if (typeof simplesRate !== 'string' || simplesRate.length === 0) {
    return {
      code: PAYLOAD_REJECTION.simplesRateMissing,
      message: 'Payload sem a alíquota do Simples Nacional.',
    }
  }
  return undefined
}

/** `null` é identificador que não vira número; `undefined`, emissão sem reedição. */
function readReissueId(providerDocumentId: string | undefined): number | null | undefined {
  if (providerDocumentId === undefined) return undefined
  const value = Number(providerDocumentId)
  return Number.isSafeInteger(value) ? value : null
}

function buildFlags(params: BuildIssueBodyParams): Readonly<Record<string, unknown>> {
  const callbackBaseUrl = params.callbackBaseUrl.replace(/\/+$/u, '')
  const isCallbackSecure = callbackBaseUrl.startsWith('https://')
  return {
    enviar_email: false,
    hash_pedido: params.providerRequestKey,
    ...(isCallbackSecure
      ? { webhook_url: `${callbackBaseUrl}/public/nfse-callbacks/${params.callbackToken}` }
      : {}),
  }
}

function buildService(input: {
  readonly issuedAt: Date
  readonly payload: IssuePayload
}): Readonly<Record<string, unknown>> {
  const { payload } = input
  return {
    aliquota_issqn: Number(toIssRatePercentage(payload.issRate)),
    codigo_tributacao_nacional: payload.nationalTaxationCode,
    data_competencia: formatCompetenceDate(input.issuedAt),
    descricao: payload.description,
    incidencia_issqn: 'operacao_tributavel',
    issqn_retido: payload.issWithheld,
    municipio: payload.municipalityIbgeCode,
    pais: 'BR',
    tributos_aproximados: { aliquota_simples_nacional: Number(payload.simplesNationalRate) },
    valor_total: Number(payload.serviceAmount),
    ...optionalText('codigo_nbs', payload.nbsCode),
    ...optionalText('codigo_tributacao_municipal', payload.municipalTaxationCode),
  }
}

function buildTaker(taker: IssuePayload['taker']): Readonly<Record<string, unknown>> {
  const { address } = taker
  const identity = { documento: stripPunctuation(taker.taxId), nome: taker.legalName }
  if (address === undefined) return identity

  return {
    ...identity,
    bairro: address.district,
    cep: address.postalCode,
    cidade: address.city,
    endereco: address.street,
    estado: address.state,
    numero: address.number,
    ...optionalText('complemento', address.complement),
    ...optionalText('telefone', address.phone),
  }
}

function optionalText(key: string, value: string | undefined): Readonly<Record<string, string>> {
  return value === undefined || value.length === 0 ? {} : { [key]: value }
}

/** São Paulo, e não UTC: às 23h daqui o instante já é o dia seguinte lá. */
function formatCompetenceDate(issuedAt: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TIME_ZONE,
    year: 'numeric',
  }).format(issuedAt)
}
