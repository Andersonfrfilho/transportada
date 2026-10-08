/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR } from './nfseInvoice.constant'

export const NFSE_NATIONAL_TAXATION_MISSING_ERROR = 'NFSE_NATIONAL_TAXATION_CODE_MISSING'

/** O mesmo formato do schema da API: percentual de 0 a 100 com até seis casas. */
const SIMPLES_RATE_PATTERN = /^(?:(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,6})?|100(?:\.0{1,6})?)$/
const NATIONAL_TAXATION_CODE_PATTERN = /^[0-9]{6}$/
const REISSUE_FAILED_KEY = 'reissueDialog.failed'

export type NationalTaxationValues = Readonly<{
  nationalTaxationCode: string
  simplesNationalRate: string
}>

export type NationalTaxationFieldErrors = Readonly<{ code: boolean; rate: boolean }>

export function toNationalTaxationCode(input: string): null | string {
  const code = input.trim()
  return NATIONAL_TAXATION_CODE_PATTERN.test(code) ? code : null
}

/** Digitado com vírgula ou ponto, segue como string: percentual não passa por ponto flutuante. */
export function toSimplesNationalRate(input: string): null | string {
  const rate = input.trim().replace(',', '.')
  return SIMPLES_RATE_PATTERN.test(rate) ? rate : null
}

/** A API devolve seis casas fixas (`2.000000`); o operador lê `2`. */
export function formatSimplesNationalRate(rate: string): string {
  if (!SIMPLES_RATE_PATTERN.test(rate)) return ''

  const [integerPart = '', fractionPart = ''] = rate.split('.')
  const trimmedFraction = fractionPart.replace(/0+$/, '')

  return trimmedFraction.length === 0 ? integerPart : `${integerPart},${trimmedFraction}`
}

/** Campo vazio é válido: o front não decide se o par é obrigatório, quem decide é a API por versão. */
export function findNationalTaxationFieldErrors(
  values: NationalTaxationValues,
): NationalTaxationFieldErrors {
  return {
    code:
      values.nationalTaxationCode.trim() !== '' &&
      toNationalTaxationCode(values.nationalTaxationCode) === null,
    rate:
      values.simplesNationalRate.trim() !== '' &&
      toSimplesNationalRate(values.simplesNationalRate) === null,
  }
}

/** O que o campo mostra: a edição em curso, ou o valor congelado na última emissão. */
export function resolveReissueNationalTaxationValues(
  input: Readonly<{
    draft: Partial<NationalTaxationValues>
    frozen: Partial<NationalTaxationValues>
  }>,
): NationalTaxationValues {
  return {
    nationalTaxationCode:
      input.draft.nationalTaxationCode ?? input.frozen.nationalTaxationCode ?? '',
    simplesNationalRate:
      input.draft.simplesNationalRate ??
      formatSimplesNationalRate(input.frozen.simplesNationalRate ?? ''),
  }
}

export function selectNfseReissueFailureKey(errorCode: null | string): string {
  if (errorCode !== NFSE_NATIONAL_TAXATION_MISSING_ERROR) return REISSUE_FAILED_KEY

  const feedbackKey = NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR[errorCode]
  return feedbackKey === undefined ? REISSUE_FAILED_KEY : `feedback.${feedbackKey}`
}
