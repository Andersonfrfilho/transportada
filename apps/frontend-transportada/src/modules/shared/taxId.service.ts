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
