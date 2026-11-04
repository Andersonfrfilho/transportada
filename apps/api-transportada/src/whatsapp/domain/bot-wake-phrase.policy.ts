/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: a palavra de chamada do bot no áudio do grupo ("atendimento Fernandes"). A frase vem
 * da instalação (`WHATSAPP_BOT_WAKE_PHRASE`), nunca do código. A transcrição erra pouco, mas erra:
 * cada palavra da frase casa pelo começo (5 letras, ou a palavra inteira se for menor), na ordem, e
 * entre elas pode haver um "da/do/de/a/o". Acentos, caixa e pontuação não contam.
 */

const FILLERS = new Set(['a', 'o', 'da', 'do', 'de', 'das', 'dos'])
const PREFIX_LENGTH = 5

function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ')
    .split(/\s+/u)
    .filter((word) => word !== '')
}

function sameWord(said: string, expected: string): boolean {
  const length = Math.min(PREFIX_LENGTH, expected.length)
  return said.length >= length && said.slice(0, length) === expected.slice(0, length)
}

/** As palavras da frase de chamada; vazia (ou ausente) desliga a chamada por voz. */
export function parseWakePhrase(value: string | undefined): readonly string[] {
  return value === undefined ? [] : words(value).filter((word) => !FILLERS.has(word))
}

/**
 * O resto do texto sem a frase de chamada (o pedido), ou `null` quando ninguém chamou o bot. O resto
 * pode vir vazio: só chamou, como o "@bot" sozinho.
 */
export function matchWakePhrase(phrase: readonly string[], text: string): null | string {
  if (phrase.length === 0) return null
  const said = text.split(/\s+/u).filter((word) => word !== '')
  const normalized = said.map((word) => words(word).join(''))
  for (let start = 0; start < normalized.length; start += 1) {
    let index = start
    let matched = 0
    while (matched < phrase.length && index < normalized.length) {
      const word = normalized[index] ?? ''
      const expected = phrase[matched] ?? ''
      if (sameWord(word, expected)) {
        matched += 1
        index += 1
      } else if (matched > 0 && FILLERS.has(word)) {
        index += 1
      } else {
        break
      }
    }
    if (matched === phrase.length) {
      return [...said.slice(0, start), ...said.slice(index)]
        .join(' ')
        .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/gu, '')
        .replace(/\s+[,.:;!?]/gu, (match) => match.trim())
        .trim()
    }
  }
  return null
}
