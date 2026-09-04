/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * CNPJ alfanumérico (IN RFB 2229/2024, NT Conjunta DF-e 2025.001, em produção desde 01/07/2026):
 * letra nas doze posições da base, dígito verificador numérico. O CPF não muda.
 *
 * O backend importa a regra de `@adatechnology/fiscal-provider`; este bundle não carrega o pacote
 * fiscal, então aqui ela é reescrita — e `test/shared/alphanumeric-tax-id.contract.ts` é o que
 * garante que as duas dizem a mesma coisa.
 */
export const CNPJ_LENGTH = 14

export const CNPJ_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/u

const CNPJ_BASE_LENGTH = 12
const TAX_ID_MASK_PATTERN = /[./\-\s]/gu

/** Só tira máscara e sobe a caixa: mapa de um caractere para um caractere, que não move o cursor. */
export function normalizeTaxId(value: string): string {
  return value.replace(TAX_ID_MASK_PATTERN, '').toUpperCase()
}

/**
 * Confere posição a posição, não o documento inteiro: o campo pela metade tem conjunto válido e
 * comprimento errado, e acusar os dois ao mesmo tempo enquanto se digita seria ruído.
 */
export function hasValidCnpjCharacterSet(value: string): boolean {
  return [...value].every((character, position) =>
    position < CNPJ_BASE_LENGTH ? /[A-Z0-9]/u.test(character) : /[0-9]/u.test(character),
  )
}

const CPF_LENGTH = 11

/** O CPF não mudou com a IN: onze dígitos, sempre — sem letra em posição nenhuma. */
export const CPF_PATTERN = /^[0-9]{11}$/u

type TaxIdMaskGroup = Readonly<{ end: number; separator: string; start: number }>

/** CPF é só dígito — grupo fixo 3-3-3-2, sem a ressalva de posição que o CNPJ alfanumérico exige. */
const CPF_GROUPS: readonly TaxIdMaskGroup[] = [
  { end: 3, separator: '', start: 0 },
  { end: 6, separator: '.', start: 3 },
  { end: 9, separator: '.', start: 6 },
  { end: 11, separator: '-', start: 9 },
]

/**
 * Máscara por posição, não por classe de caractere: a base do CNPJ alfanumérico tem letra, e um
 * `\d` no lugar errado deixaria de mascarar o documento inteiro.
 */
const CNPJ_GROUPS: readonly TaxIdMaskGroup[] = [
  { end: 2, separator: '', start: 0 },
  { end: 5, separator: '.', start: 2 },
  { end: 8, separator: '.', start: 5 },
  { end: 12, separator: '/', start: 8 },
  { end: 14, separator: '-', start: 12 },
]

function formatByGroups(document: string, groups: readonly TaxIdMaskGroup[]): string {
  let masked = ''
  for (const group of groups) {
    const part = document.slice(group.start, group.end)
    if (part === '') break
    masked += masked === '' ? part : `${group.separator}${part}`
  }
  return masked
}

/** Acima do tamanho legal a máscara sairia do lugar e esconderia o excesso — melhor exibir cru. */
export function formatCpf(value: string): string {
  const document = normalizeTaxId(value)
  if (document.length > CPF_LENGTH) return document
  return formatByGroups(document, CPF_GROUPS)
}

/** Acima do tamanho legal a máscara sairia do lugar e esconderia o excesso — melhor exibir cru. */
export function formatCnpj(value: string): string {
  const document = normalizeTaxId(value)
  if (document.length > CNPJ_LENGTH) return document
  return formatByGroups(document, CNPJ_GROUPS)
}

/**
 * Campo que aceita pessoa ou empresa: decide o formato pelo tamanho já digitado, porque CPF
 * completo (11) nunca é prefixo válido de CNPJ (12 na base) — não há ambiguidade no corte.
 */
export function formatTaxId(value: string): string {
  const document = normalizeTaxId(value)
  return document.length <= CPF_LENGTH ? formatCpf(document) : formatCnpj(document)
}
