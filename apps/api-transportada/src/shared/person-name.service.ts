/* Copyright (c) 2026 Ada Technology. MIT License. */
const PERSON_NAME_LOCALE = 'pt-BR'
const WHITESPACE_PATTERN = /\s+/g
/** `D'Ávila` e `Silva-Souza` são dois nomes colados: cada lado do sinal leva maiúscula própria. */
const SEGMENT_SEPARATOR_PATTERN = /(['-])/

/**
 * Ligação fica minúscula em qualquer posição, não só no meio: o campo de sobrenome guarda
 * `da Silva`, e subir a caixa da primeira palavra dele daria `Da Silva`, que não é grafia de nome.
 */
export const PERSON_NAME_CONNECTIVES: readonly string[] = ['da', 'das', 'de', 'do', 'dos', 'e']

const CONNECTIVE_SET: ReadonlySet<string> = new Set(PERSON_NAME_CONNECTIVES)

function capitalizeSegment(segment: string): string {
  if (segment === '') return ''
  return `${segment.charAt(0).toLocaleUpperCase(PERSON_NAME_LOCALE)}${segment.slice(1)}`
}

function capitalizeWord(word: string): string {
  if (CONNECTIVE_SET.has(word)) return word
  return word.split(SEGMENT_SEPARATOR_PATTERN).map(capitalizeSegment).join('')
}

/**
 * A grafia que se lê: primeira letra de cada palavra em maiúscula, ligação em minúscula. O espaço
 * é preservado como veio porque esta mesma função corre a cada tecla no formulário — colapsar
 * espaço aqui impediria o operador de digitar o espaço antes do sobrenome.
 */
export function toDisplayPersonName(value: string): string {
  return value.toLocaleLowerCase(PERSON_NAME_LOCALE).split(' ').map(capitalizeWord).join(' ')
}

/**
 * A grafia que se grava: tudo em minúscula, sem espaço sobrando. O banco guarda uma forma só para
 * `JOSÉ DA SILVA` e `José da Silva` não virarem dois motoristas com o mesmo CPF na busca por nome.
 */
export function toStoredPersonName(value: string): string {
  return value.trim().replace(WHITESPACE_PATTERN, ' ').toLocaleLowerCase(PERSON_NAME_LOCALE)
}
