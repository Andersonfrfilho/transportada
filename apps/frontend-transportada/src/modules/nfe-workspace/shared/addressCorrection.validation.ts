/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O pedido de correção de endereço à contratante (spec 150, T201).
 *
 * ⚠️ **Cópia por valor da API, não código importado.** Como `ADDRESS_FINDING_KINDS`, a tabela de UF
 * e o prefixo IBGE são dado de domínio duplicado de propósito
 * (`api-transportada/src/address-correction/domain/brazilian-state.constant.ts`): mudou de um lado,
 * mude do outro — os dois lados têm o mesmo contrato de teste (`test/nfe-workspace/address-correction.contract.ts`).
 */
export const BRAZILIAN_STATE_IBGE_PREFIX: Readonly<Record<string, string>> = {
  AC: '12',
  AL: '27',
  AM: '13',
  AP: '16',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MG: '31',
  MS: '50',
  MT: '51',
  PA: '15',
  PB: '25',
  PE: '26',
  PI: '22',
  PR: '41',
  RJ: '33',
  RN: '24',
  RO: '11',
  RR: '14',
  RS: '43',
  SC: '42',
  SE: '28',
  SP: '35',
  TO: '17',
}

export const BRAZILIAN_STATES = Object.keys(BRAZILIAN_STATE_IBGE_PREFIX)

const POSTAL_CODE_PATTERN = /^\d{8}$/u
const CITY_CODE_PATTERN = /^\d{7}$/u

export type AddressCorrectionFields = Readonly<{
  city: string
  cityCode: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type AddressCorrectionRequestStatus = 'draft' | 'sent'

export type AddressCorrectionRequestRecord = Readonly<{
  addressKey: string
  /** Spec 150 T305: o `requestId` que `POST /address-correction-requests/mail` espera no envio unitário. */
  id: string
  proposed: AddressCorrectionFields
  reasonDistanceMetres: null | string
  reasonMatchLevel: string
  recipientName: null | string
  reported: AddressCorrectionFields
  sentAt: null | string
  status: AddressCorrectionRequestStatus
}>

export type AddressCorrectionFieldErrors = Readonly<{
  city?: string
  cityCode?: string
  number?: string
  postalCode?: string
  state?: string
  street?: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function text(value: unknown): string {
  return isString(value) ? value : ''
}

function nullableText(value: unknown): null | string {
  return isString(value) ? value : null
}

function isRequestStatus(value: unknown): value is AddressCorrectionRequestStatus {
  return value === 'draft' || value === 'sent'
}

function mapFields(value: unknown): AddressCorrectionFields {
  const fields = isRecord(value) ? value : {}
  return {
    city: text(fields.city),
    cityCode: text(fields.cityCode),
    complement: text(fields.complement),
    district: text(fields.district),
    number: text(fields.number),
    postalCode: text(fields.postalCode),
    state: text(fields.state),
    street: text(fields.street),
  }
}

/** Registro desconhecido (status que esta versão não entende) some da lista, não a lista inteira. */
export function mapAddressCorrectionRequest(value: unknown): AddressCorrectionRequestRecord | null {
  if (
    !isRecord(value) ||
    !isString(value.addressKey) ||
    !isString(value.id) ||
    !isRequestStatus(value.status)
  ) {
    return null
  }

  return {
    addressKey: value.addressKey,
    id: value.id,
    proposed: mapFields(value.proposed),
    reasonDistanceMetres: nullableText(value.reasonDistanceMetres),
    reasonMatchLevel: text(value.reasonMatchLevel),
    recipientName: nullableText(value.recipientName),
    reported: mapFields(value.reported),
    sentAt: nullableText(value.sentAt),
    status: value.status,
  }
}

export function mapAddressCorrectionRequestList(
  value: unknown,
): readonly AddressCorrectionRequestRecord[] {
  const data = isRecord(value) ? value.data : undefined
  if (!Array.isArray(data)) return []
  return data
    .map(mapAddressCorrectionRequest)
    .filter((request): request is AddressCorrectionRequestRecord => request !== null)
}

function stripPostalCodeSeparators(value: string): string {
  return value.replace(/[\s.\-/]/gu, '')
}

export function isValidPostalCode(value: string): boolean {
  return POSTAL_CODE_PATTERN.test(stripPostalCodeSeparators(value))
}

export function isValidBrazilianState(value: string): boolean {
  return BRAZILIAN_STATES.includes(value)
}

/**
 * RF3: o código IBGE de 7 dígitos precisa começar pelo prefixo de UF da UF proposta — as mesmas
 * duas regras do servidor (`proposedAddressSchema`), na mesma ordem de aparição do erro.
 */
export function isValidCityCode(input: Readonly<{ cityCode: string; state: string }>): boolean {
  if (!CITY_CODE_PATTERN.test(input.cityCode)) return false
  const prefix = BRAZILIAN_STATE_IBGE_PREFIX[input.state]
  return prefix !== undefined && input.cityCode.startsWith(prefix)
}

/**
 * As mesmas regras da fronteira do servidor (`address-correction-request.schema.ts`), em
 * funções puras: o operador vê o erro digitando, sem esperar o `400` voltar.
 */
export function validateAddressCorrectionFields(
  fields: AddressCorrectionFields,
): AddressCorrectionFieldErrors {
  const errors: { -readonly [K in keyof AddressCorrectionFieldErrors]?: string } = {}

  if (fields.street.trim().length === 0) {
    errors.street = 'addressCorrection.error.streetRequired'
  }
  if (fields.number.trim().length === 0) {
    errors.number = 'addressCorrection.error.numberRequired'
  }
  if (fields.city.trim().length === 0) {
    errors.city = 'addressCorrection.error.cityRequired'
  }
  if (!isValidBrazilianState(fields.state)) {
    errors.state = 'addressCorrection.error.stateInvalid'
  }
  if (!isValidPostalCode(fields.postalCode)) {
    errors.postalCode = 'addressCorrection.error.postalCodeInvalid'
  }
  if (!isValidCityCode({ cityCode: fields.cityCode, state: fields.state })) {
    errors.cityCode = 'addressCorrection.error.cityCodeInvalid'
  }

  return errors
}

const CITY_CODE_FROM_ADDRESS_KEY_PATTERN = /^(\d{7})\|/u

/**
 * A `addressKey` é `cityCode|postalCode|number` (`stop-address-key.ts`, mesmo lado do servidor).
 * O prefixo pode vir vazio quando a rotina de medição não resolveu o município — o formulário nasce
 * então com o campo em branco, editável, em vez de travar numa leitura que não existe.
 */
export function cityCodeFromAddressKey(addressKey: string): string {
  return CITY_CODE_FROM_ADDRESS_KEY_PATTERN.exec(addressKey)?.[1] ?? ''
}

/** CEP terminado em `-000` pode ser o CEP único da cidade (084 T14) — nunca sugerir que está errado. */
export function isGenericCityPostalCode(value: string): boolean {
  const digits = stripPostalCodeSeparators(value)
  return POSTAL_CODE_PATTERN.test(digits) && digits.endsWith('000')
}
