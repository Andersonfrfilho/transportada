/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T12/T14 — **o interpretador do comando direto do motorista** ("saí", "cheguei"), um só
 * para o grupo (Evolution) e para a conversa individual (Meta), para não haver duas gramáticas.
 * Regra pura sobre o texto, sem acesso a banco.
 *
 * Só reconhece frase curta (até 6 palavras): "cliente fechado, cheguei e ninguém atendeu" é uma
 * ocorrência em texto livre, não um "cheguei". Número de nota na frase ("cheguei 17234") é pista
 * da parada, devolvida em `documentNumbers`.
 */

export const WHATSAPP_DRIVER_STOP_COMMAND = { arrive: 'arrive', depart: 'depart' } as const

export type WhatsAppDriverStopCommandEvent =
  (typeof WHATSAPP_DRIVER_STOP_COMMAND)[keyof typeof WHATSAPP_DRIVER_STOP_COMMAND]

export type WhatsAppDriverStopCommand = {
  readonly documentNumbers: readonly string[]
  readonly event: WhatsAppDriverStopCommandEvent
}

const MAX_WORDS = 6

const ARRIVE_WORDS = new Set(['cheguei', 'chegando', 'chegamos', 'cheguemos', 'chegei', 'chegamo'])
const DEPART_WORDS = new Set(['sai', 'saindo', 'saimos', 'saiu', 'saimo'])
const ROUTE_START_WORDS = new Set(['iniciar', 'inicia', 'inicio', 'iniciei', 'inicie', 'iniciando'])
/** Palavras que podem acompanhar o comando sem mudar o sentido ("saí para a entrega", "to saindo"). */
const FILLER = new Set([
  'a',
  'agora',
  'ao',
  'apra',
  'cliente',
  'da',
  'de',
  'do',
  'e',
  'entrega',
  'estou',
  'eu',
  'ja',
  'na',
  'no',
  'nf',
  'nota',
  'num',
  'o',
  'p',
  'pa',
  'para',
  'parada',
  'pra',
  'pro',
  'rota',
  'to',
  'tou',
  'viagem',
])

const MIN_FUZZY_WORD_LENGTH = 4
const MIN_FUZZY_TARGET_LENGTH = 6

/** Distância de edição com troca de letras vizinhas ("chegeui"), para erro de digitação de 1 toque. */
export function editDistance(left: string, right: string): number {
  const rows = left.length + 1
  const columns = right.length + 1
  const table: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)),
  )
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      let best = Math.min(
        (table[row - 1]?.[column] ?? 0) + 1,
        (table[row]?.[column - 1] ?? 0) + 1,
        (table[row - 1]?.[column - 1] ?? 0) + cost,
      )
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        best = Math.min(best, (table[row - 2]?.[column - 2] ?? 0) + 1)
      }
      const current = table[row]
      if (current !== undefined) current[column] = best
    }
  }
  return table[rows - 1]?.[columns - 1] ?? 0
}

/** Palavra do vocabulário, exata ou com 1 erro de digitação (só palavra de 4+ letras contra alvo de 6+). */
export function isWordOf(word: string, vocabulary: ReadonlySet<string>): boolean {
  if (vocabulary.has(word)) return true
  if (word.length < MIN_FUZZY_WORD_LENGTH) return false
  for (const target of vocabulary) {
    if (target.length >= MIN_FUZZY_TARGET_LENGTH && editDistance(word, target) <= 1) return true
  }
  return false
}

const FUZZY_FILLER = new Set(['cliente', 'entrega', 'parada', 'viagem'])
const isFiller = (word: string): boolean => FILLER.has(word) || isWordOf(word, FUZZY_FILLER)

export function normalizeDriverCommandText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** `null` quando o texto não é um "saí"/"cheguei" direto (vira ocorrência ou pergunta do menu). */
export function interpretDriverStopCommand(text: string): WhatsAppDriverStopCommand | null {
  const normalized = normalizeDriverCommandText(text)
  if (normalized === '') return null
  const words = normalized.split(' ')
  if (words.length > MAX_WORDS) return null

  const arrive = words.some((word) => isWordOf(word, ARRIVE_WORDS))
  const depart =
    words.some((word) => isWordOf(word, DEPART_WORDS)) ||
    (words.some((word) => isWordOf(word, ROUTE_START_WORDS)) && words.includes('rota'))
  if (arrive === depart) return null

  const documentNumbers = words
    .filter((word) => /^\d+$/u.test(word))
    .map((word) => word.replace(/^0+/u, ''))
    .filter((word) => word !== '')
  const rest = words.filter(
    (word) =>
      !/^\d+$/u.test(word) &&
      !isWordOf(word, ARRIVE_WORDS) &&
      !isWordOf(word, DEPART_WORDS) &&
      !isWordOf(word, ROUTE_START_WORDS) &&
      !isFiller(word),
  )
  if (rest.length > 0) return null
  return {
    documentNumbers,
    event: arrive ? WHATSAPP_DRIVER_STOP_COMMAND.arrive : WHATSAPP_DRIVER_STOP_COMMAND.depart,
  }
}
