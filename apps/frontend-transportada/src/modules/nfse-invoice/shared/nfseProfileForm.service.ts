/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './nfseInvoiceGuards.validation'
import {
  NFSE_ISS_EXIGIBILITIES,
  NFSE_TAKERS,
  type NfseEmissionProfileSettings,
  type NfseIssExigibility,
  type NfseTaker,
} from './nfseSettings.types'

export const NFSE_PROFILE_BLOCK_REASON = {
  CNAE_INVALID: 'cnaeInvalid',
  DESCRIPTION_MAX_LENGTH_INVALID: 'descriptionMaxLengthInvalid',
  DESCRIPTION_TEMPLATE_REQUIRED: 'descriptionTemplateRequired',
  FREIGHT_RULE_REQUIRED: 'freightRuleRequired',
  ISS_RATE_INVALID: 'issRateInvalid',
  MUNICIPALITY_INVALID: 'municipalityInvalid',
  NAME_REQUIRED: 'nameRequired',
  SERVICE_LIST_ITEM_REQUIRED: 'serviceListItemRequired',
} as const
export type NfseProfileBlockReason =
  (typeof NFSE_PROFILE_BLOCK_REASON)[keyof typeof NFSE_PROFILE_BLOCK_REASON]

/** As únicas que o motor de descrição da API resolve — qualquer outra derruba a emissão. */
export const NFSE_DESCRIPTION_VARIABLES = [
  '{{municipio}}',
  '{{notas}}',
  '{{observacoes}}',
  '{{periodo}}',
  '{{quantidadeNotas}}',
] as const

const CNAE_PATTERN = /^[0-9]{7}$/
const IBGE_CITY_PATTERN = /^[0-9]{7}$/
const PERCENT_PATTERN = /^([0-9]{1,3})(?:\.([0-9]{1,4}))?$/
const RATE_PATTERN = /^([0-9])\.([0-9]{6})$/
/** O mesmo teto do schema da API: acima de 100% só existe o próprio 100%. */
const RATE_RANGE_PATTERN = /^(?:0\.[0-9]{6}|1\.000000)$/
const NAME_MIN_LENGTH = 2
const DESCRIPTION_MAX_LENGTH_FLOOR = 200
const DESCRIPTION_MAX_LENGTH_CEILING = 5000
const RATE_DECIMALS = 6
const PERCENT_DECIMALS = 2

export type NfseProfileDraft = Readonly<{
  chargeComponentLabel: string
  cnaeCode: string
  descriptionMaxLength: string
  descriptionTemplate: string
  freightRuleId: string
  issExigibility: NfseIssExigibility
  issRatePercent: string
  issWithheld: boolean
  municipalTaxationCode: string
  municipalityIbgeCode: string
  municipalityName: string
  name: string
  nbsCode: string
  observations: string
  serviceListItem: string
  taker: NfseTaker
}>

export type NfseProfileSubmission =
  | Readonly<{ reason: NfseProfileBlockReason; status: 'blocked' }>
  | Readonly<{ settings: NfseEmissionProfileSettings; status: 'ready' }>

export const EMPTY_NFSE_PROFILE_DRAFT: NfseProfileDraft = {
  chargeComponentLabel: '',
  cnaeCode: '',
  descriptionMaxLength: '2000',
  descriptionTemplate: '',
  freightRuleId: '',
  issExigibility: '1',
  issRatePercent: '',
  issWithheld: false,
  municipalTaxationCode: '',
  municipalityIbgeCode: '',
  municipalityName: '',
  name: '',
  nbsCode: '',
  observations: '',
  serviceListItem: '',
  taker: '0',
}

/**
 * Percentual e fração são a mesma grandeza com a vírgula em lugares diferentes: a conversão move
 * dígitos em string. Dividir por 100 em ponto flutuante devolveria `0.020000000000000004`.
 */
export function toIssRateDecimal(percent: string): null | string {
  const match = PERCENT_PATTERN.exec(percent.trim().replace(',', '.'))
  if (match === null) return null

  const fraction = match[2] ?? ''
  const digits = `${match[1] ?? ''}${fraction}`
  const decimals = fraction.length + PERCENT_DECIMALS
  const padded = digits.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, padded.length - decimals)
  const decimalPart = padded.slice(padded.length - decimals).padEnd(RATE_DECIMALS, '0')

  const rate = `${stripLeadingZeros(integerPart)}.${decimalPart}`
  return RATE_RANGE_PATTERN.test(rate) ? rate : null
}

export function toIssRatePercent(rate: string): string {
  const match = RATE_PATTERN.exec(rate)
  if (match === null) return ''

  const digits = `${match[1] ?? ''}${match[2] ?? ''}`
  const decimals = RATE_DECIMALS - PERCENT_DECIMALS
  const integerPart = stripLeadingZeros(digits.slice(0, digits.length - decimals))
  const decimalPart = digits.slice(digits.length - decimals).replace(/0+$/, '')

  return decimalPart.length === 0 ? integerPart : `${integerPart},${decimalPart}`
}

function stripLeadingZeros(value: string): string {
  const trimmed = value.replace(/^0+/, '')
  return trimmed.length === 0 ? '0' : trimmed
}

export function toNfseProfileDraft(profile: unknown): NfseProfileDraft {
  if (!isRecord(profile)) return EMPTY_NFSE_PROFILE_DRAFT

  return {
    chargeComponentLabel: readText(profile['chargeComponentLabel']),
    cnaeCode: readText(profile['cnaeCode']),
    descriptionMaxLength: readText(profile['descriptionMaxLength']),
    descriptionTemplate: readText(profile['descriptionTemplate']),
    freightRuleId: readText(profile['freightRuleId']),
    issExigibility: readOption(profile['issExigibility'], NFSE_ISS_EXIGIBILITIES, '1'),
    issRatePercent: toIssRatePercent(readText(profile['issRate'])),
    issWithheld: profile['issWithheld'] === true,
    municipalTaxationCode: readText(profile['municipalTaxationCode']),
    municipalityIbgeCode: readText(profile['municipalityIbgeCode']),
    municipalityName: readText(profile['municipalityName']),
    name: readText(profile['name']),
    nbsCode: readText(profile['nbsCode']),
    observations: readText(profile['observations']),
    serviceListItem: readText(profile['serviceListItem']),
    taker: readOption(profile['taker'], NFSE_TAKERS, '0'),
  }
}

export function buildNfseProfileSubmission(draft: NfseProfileDraft): NfseProfileSubmission {
  const name = draft.name.trim()
  if (name.length < NAME_MIN_LENGTH) return blocked(NFSE_PROFILE_BLOCK_REASON.NAME_REQUIRED)

  if (draft.freightRuleId.trim().length === 0)
    return blocked(NFSE_PROFILE_BLOCK_REASON.FREIGHT_RULE_REQUIRED)

  const serviceListItem = draft.serviceListItem.trim()
  if (serviceListItem.length === 0)
    return blocked(NFSE_PROFILE_BLOCK_REASON.SERVICE_LIST_ITEM_REQUIRED)

  if (!CNAE_PATTERN.test(draft.cnaeCode.trim()))
    return blocked(NFSE_PROFILE_BLOCK_REASON.CNAE_INVALID)

  const municipalityName = draft.municipalityName.trim()
  if (!IBGE_CITY_PATTERN.test(draft.municipalityIbgeCode.trim()) || municipalityName.length === 0)
    return blocked(NFSE_PROFILE_BLOCK_REASON.MUNICIPALITY_INVALID)

  const issRate = toIssRateDecimal(draft.issRatePercent)
  if (issRate === null) return blocked(NFSE_PROFILE_BLOCK_REASON.ISS_RATE_INVALID)

  const descriptionTemplate = draft.descriptionTemplate.trim()
  if (descriptionTemplate.length === 0)
    return blocked(NFSE_PROFILE_BLOCK_REASON.DESCRIPTION_TEMPLATE_REQUIRED)

  const descriptionMaxLength = Number(draft.descriptionMaxLength)
  if (
    !Number.isInteger(descriptionMaxLength) ||
    descriptionMaxLength < DESCRIPTION_MAX_LENGTH_FLOOR ||
    descriptionMaxLength > DESCRIPTION_MAX_LENGTH_CEILING
  )
    return blocked(NFSE_PROFILE_BLOCK_REASON.DESCRIPTION_MAX_LENGTH_INVALID)

  return {
    settings: {
      chargeComponentLabel: draft.chargeComponentLabel.trim(),
      cnaeCode: draft.cnaeCode.trim(),
      descriptionMaxLength: String(descriptionMaxLength),
      descriptionTemplate,
      freightRuleId: draft.freightRuleId.trim(),
      issExigibility: draft.issExigibility,
      issRate,
      issWithheld: draft.issWithheld,
      municipalTaxationCode: draft.municipalTaxationCode.trim(),
      municipalityIbgeCode: draft.municipalityIbgeCode.trim(),
      municipalityName,
      name,
      nbsCode: draft.nbsCode.trim(),
      observations: draft.observations.trim(),
      serviceListItem,
      taker: draft.taker,
    },
    status: 'ready',
  }
}

function blocked(reason: NfseProfileBlockReason): NfseProfileSubmission {
  return { reason, status: 'blocked' }
}

function readText(value: unknown): string {
  return isString(value) ? value : ''
}

function readOption<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
  fallback: TOption,
): TOption {
  return options.find((candidate) => candidate === value) ?? fallback
}
