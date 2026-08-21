/* Copyright (c) 2026 Ada Technology. MIT License. */
const PERSON_NAME_LOCALE = 'pt-BR'
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
 * Cópia por valor de `api-transportada/src/shared/person-name.service.ts` — o bundle não carrega
 * código da API, e a grafia tem de ser a mesma de quem grava. Contrato em
 * `test/shared/person-name.contract.ts`; a paridade é comportamento, não diff de texto.
 *
 * O espaço é preservado como veio porque esta função corre a cada tecla: colapsar espaço aqui
 * impediria o operador de digitar o espaço antes do sobrenome.
 */
export function toDisplayPersonName(value: string): string {
  return value.toLocaleLowerCase(PERSON_NAME_LOCALE).split(' ').map(capitalizeWord).join(' ')
}
