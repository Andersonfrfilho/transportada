/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 220 RF28: texto livre que o usuário digita não pode carregar dado pessoal. A guarda mora
 * aqui, e não dentro do módulo de viagens, porque a spec 162 (expurgo) precisa da mesma regra —
 * duas cópias divergem na primeira correção.
 *
 * O detector é deliberadamente conservador: recusa o que tem forma inequívoca de dado pessoal e
 * deixa passar número de nota, peso, prazo e valor. Guarda que barra motivo legítimo é guarda que
 * se aprende a driblar, e o texto volta pior.
 *
 * Oito dígitos soltos **não** são tratados como CEP: colidem com número de nota e com valor sem
 * separador. O CEP só é reconhecido na forma pontuada.
 */
export const PersonalDataKind = {
  CNPJ: 'cnpj',
  CPF: 'cpf',
  EMAIL: 'email',
  PHONE: 'phone',
  POSTAL_CODE: 'postalCode',
} as const
export type PersonalDataKind = (typeof PersonalDataKind)[keyof typeof PersonalDataKind]

/**
 * A ordem importa: CNPJ antes de CPF (quatorze dígitos não podem cair na regra de onze), e CEP
 * antes de telefone. Onze dígitos crus casam CPF primeiro — se é CPF ou celular não muda o
 * veredito, os dois são dado pessoal.
 */
const PERSONAL_DATA_PATTERNS: readonly (readonly [PersonalDataKind, RegExp])[] = [
  [PersonalDataKind.EMAIL, /[\w.+-]+@[\w-]+\.[\w.-]*\w/u],
  [PersonalDataKind.CNPJ, /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/u],
  [PersonalDataKind.CPF, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/u],
  [PersonalDataKind.POSTAL_CODE, /\b\d{5}-\d{3}\b/u],
  [PersonalDataKind.PHONE, /(?:\+\d{2}\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/u],
] as const

/** Devolve a categoria encontrada, nunca o valor: a mensagem de erro não pode vazar o dado. */
export function detectPersonalData(text: string): PersonalDataKind | undefined {
  for (const [kind, pattern] of PERSONAL_DATA_PATTERNS) {
    if (pattern.test(text)) return kind
  }

  return undefined
}
