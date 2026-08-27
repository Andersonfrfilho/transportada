/* Copyright (c) 2026 Ada Technology. MIT License. */

import { isValidCnpj, readValueBelowLabel, type PdfPageText } from '@adatechnology/document-intake'

import { normalizeTaxId } from '@/modules/shared/taxId.service'

import type { CompanyDeclaredFields } from './cnpjInfo.service'

/**
 * Spec 066: o CCMEI preenche o que ele diz, e **só** o que ele diz. Cada campo que fica em branco
 * fica com o motivo à vista — campo vazio sem explicação vira digitação de novo, e valor inventado
 * vira cadastro errado.
 *
 * O mapa de rótulos abaixo veio de uma amostra real conferida à mão, fora do repositório: a
 * § Privacidade da 048 recusa PII versionada, e o CCMEI imprime CPF, RG e endereço do empresário.
 * O teste gera um PDF sintético com camada de texto de verdade — ele prova bytes → fragmento →
 * geometria → campo, não que o layout do gov.br seja este.
 */
export type CcmeiRemarkReason = 'checkDigitFailed' | 'notInformed' | 'notPrinted' | 'notReadable'

export type CcmeiRemark = Readonly<{
  field: string
  reason: CcmeiRemarkReason
}>

export type CcmeiAddress = Readonly<{
  district: string
  municipality: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type CcmeiValues = Readonly<{
  address: CcmeiAddress
  cnpj: string
  legalName: string
  openedAt: string
  ownerName: string
  situation: string
  tradeName: string
}>

export type CcmeiReading = Readonly<{
  remarks: readonly CcmeiRemark[]
  values: Partial<CcmeiValues>
}>

/** Na ordem em que o documento imprime — é assim que se confere o mapa contra uma amostra. */
const LABEL = {
  cnpj: 'CNPJ',
  district: 'Bairro',
  legalName: 'Nome Empresarial',
  municipality: 'Município',
  number: 'Número',
  openedAt: 'Data de Início de Atividades',
  ownerName: 'Nome do Empresário',
  postalCode: 'CEP',
  situation: 'Situação Cadastral Vigente',
  state: 'UF',
  street: 'Logradouro',
  tradeName: 'Nome Fantasia',
} as const

const CNPJ_LENGTH = 14
const POSTAL_CODE_LENGTH = 8
const PRINTED_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/u

/** Só o campo de texto é escrito em laço; CNPJ, data e endereço têm cada um a sua regra. */
type TextField = 'legalName' | 'ownerName' | 'situation' | 'tradeName'

type MutableValues = { -readonly [Key in keyof CcmeiValues]?: CcmeiValues[Key] }

type Collected = {
  readonly remarks: CcmeiRemark[]
  readonly values: MutableValues
}

function readLabel(page: PdfPageText, label: string): string | undefined {
  const value = readValueBelowLabel(page.fragments, label)
  const trimmed = value?.trim()

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

/**
 * Lê o rótulo e registra a ausência com o motivo certo: rótulo que o documento não imprime é
 * `notPrinted`. Sem essa distinção o operador não sabe se o campo faltou no documento ou se a
 * leitura falhou.
 */
function collectText(input: {
  readonly collected: Collected
  readonly field: keyof typeof LABEL
  readonly page: PdfPageText
}): string | undefined {
  const printed = readLabel(input.page, LABEL[input.field])
  if (printed === undefined) {
    input.collected.remarks.push({ field: input.field, reason: 'notPrinted' })
    return undefined
  }

  return printed
}

/** Canonicalização do CNPJ: sem máscara e em caixa alta — o alfanumérico entra em 01/07/2026. */
function normalizeCnpj(printed: string): string {
  return printed.replace(/[^0-9A-Za-z]/gu, '').toUpperCase()
}

/**
 * A consulta à Receita devolve a data em ISO (medido: `2019-04-11`) e o CCMEI imprime `dd/mm/aaaa`.
 * Converter aqui é o que permite comparar data com data em vez de formato com formato. Data que não
 * existe no calendário — 31/02 — é leitura errada, não data nova.
 */
function toIsoDate(printed: string): string | undefined {
  const matched = PRINTED_DATE_PATTERN.exec(printed)
  if (matched === null) return undefined

  const [, day = '', month = '', year = ''] = matched
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return undefined

  return parsed.toISOString().slice(0, 10) === iso ? iso : undefined
}

export function readCcmei(page: PdfPageText): CcmeiReading {
  const collected: Collected = { remarks: [], values: {} }

  const textFields: readonly TextField[] = ['legalName', 'ownerName', 'tradeName', 'situation']
  for (const field of textFields) {
    const printed = collectText({ collected, field, page })
    if (printed !== undefined) collected.values[field] = printed
  }

  const printedCnpj = collectText({ collected, field: 'cnpj', page })
  if (printedCnpj !== undefined) {
    const normalized = normalizeCnpj(printedCnpj)
    if (normalized.length === CNPJ_LENGTH && isValidCnpj(normalized)) {
      collected.values.cnpj = normalized
    } else {
      collected.remarks.push({ field: 'cnpj', reason: 'checkDigitFailed' })
    }
  }

  const printedDate = collectText({ collected, field: 'openedAt', page })
  if (printedDate !== undefined) {
    const iso = toIsoDate(printedDate)
    if (iso === undefined) collected.remarks.push({ field: 'openedAt', reason: 'notReadable' })
    else collected.values.openedAt = iso
  }

  const address = readAddress({ collected, page })
  if (address !== undefined) collected.values.address = address

  return { remarks: collected.remarks, values: collected.values }
}

/** O endereço só existe inteiro: metade dele preenchendo o formulário é pior que nenhum. */
function readAddress(input: {
  readonly collected: Collected
  readonly page: PdfPageText
}): CcmeiAddress | undefined {
  const district = collectText({ ...input, field: 'district' })
  const municipality = collectText({ ...input, field: 'municipality' })
  const number = collectText({ ...input, field: 'number' })
  const postalCode = collectText({ ...input, field: 'postalCode' })
  const state = collectText({ ...input, field: 'state' })
  const street = collectText({ ...input, field: 'street' })

  if (
    district === undefined ||
    municipality === undefined ||
    number === undefined ||
    postalCode === undefined ||
    state === undefined ||
    street === undefined
  ) {
    return undefined
  }

  const digits = postalCode.replace(/\D/gu, '')
  if (digits.length !== POSTAL_CODE_LENGTH) {
    input.collected.remarks.push({ field: 'postalCode', reason: 'notReadable' })
    return undefined
  }

  return {
    district,
    municipality,
    number,
    postalCode: digits,
    state: state.toUpperCase(),
    street,
  }
}

/**
 * O CCMEI entra no que está **vazio**, nunca por cima do que a pessoa escreveu nem por cima do que a
 * consulta trouxe: ele existe para preencher o que a consulta não prova (P2), e o CNPJ digitado é
 * dela — divergir dele é assunto do operador, não deste merge.
 */
export function mergeCcmeiIntoFields(input: {
  readonly current: CompanyDeclaredFields
  readonly formatPostalCode: (value: string) => string
  readonly values: Partial<CcmeiValues>
}): CompanyDeclaredFields {
  const { current, values } = input
  const address = values.address
  const keepOrFill = (typed: string, fromDocument: string | undefined): string =>
    typed === '' ? (fromDocument ?? '') : typed

  return {
    city: keepOrFill(current.city, address?.municipality),
    companyLegalName: keepOrFill(current.companyLegalName, values.legalName),
    companyOpenedAt: keepOrFill(current.companyOpenedAt, values.openedAt),
    companySituation: keepOrFill(current.companySituation, values.situation),
    companyTradeName: keepOrFill(current.companyTradeName, values.tradeName),
    complement: current.complement,
    district: keepOrFill(current.district, address?.district),
    number: keepOrFill(current.number, address?.number),
    postalCode:
      current.postalCode === '' && address !== undefined
        ? input.formatPostalCode(address.postalCode)
        : current.postalCode,
    state: keepOrFill(current.state, address?.state),
    street: keepOrFill(current.street, address?.street),
  }
}

export type CcmeiDivergence = Readonly<{
  declared: string
  field: string
  read: string
}>

/** O que o documento diz de cada campo já preenchido — o resto do merge cuida do que está vazio. */
const COMPARED: readonly Readonly<{
  field: 'companyLegalName' | 'companyOpenedAt' | 'taxId'
  read: (values: Partial<CcmeiValues>) => string | undefined
}>[] = [
  { field: 'taxId', read: (values) => values.cnpj },
  { field: 'companyLegalName', read: (values) => values.legalName },
  { field: 'companyOpenedAt', read: (values) => values.openedAt },
]

/**
 * O documento **confere**, não manda: o CNPJ digitado é da pessoa, e um arquivo anexado reescrever o
 * cadastro de quem o anexou seria inverter quem decide. Divergência é sinal para revisão humana.
 *
 * Duas coisas que não são divergência, e tratá-las como tal treinaria o operador a ignorar o aviso:
 * campo em branco (é o que o documento vai preencher) e campo que o documento não trouxe (ausência
 * nunca é conflito). A comparação do CNPJ é canônica — máscara é do teclado, não do dado.
 */
export function listCcmeiDivergences(input: {
  readonly current: Readonly<{ companyLegalName: string; companyOpenedAt: string; taxId: string }>
  readonly values: Partial<CcmeiValues>
}): readonly CcmeiDivergence[] {
  const divergences: CcmeiDivergence[] = []

  for (const { field, read } of COMPARED) {
    const readValue = read(input.values)
    const declared = input.current[field]
    if (readValue === undefined || declared === '') continue

    const left = field === 'taxId' ? normalizeTaxId(declared) : declared.trim().toUpperCase()
    const right = field === 'taxId' ? normalizeTaxId(readValue) : readValue.trim().toUpperCase()
    if (left === right) continue

    divergences.push({
      declared: field === 'taxId' ? left : declared,
      field,
      read: field === 'taxId' ? right : readValue,
    })
  }

  return divergences
}
