/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { CcmeiValues } from '@adatechnology/document-intake'

import { normalizeTaxId } from '@/modules/shared/taxId.service'

import type { CompanyDeclaredFields } from './cnpjInfo.service'

/**
 * O que sobrou aqui depende de **ter formulário**: encaixar a leitura nos campos vazios e comparar
 * com o que a pessoa digitou. A extração em si mora em `@adatechnology/document-intake`, porque a
 * API também a faz — sobre o arquivo que chegou ao bucket.
 */
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
