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

const ARRIVE_WORDS = new Set(['cheguei', 'chegando', 'chegamos', 'cheguemos'])
const DEPART_WORDS = new Set(['sai', 'saindo', 'saimos', 'saiu'])
const DEPART_PHRASES = [
  /\biniciar rota\b/u,
  /\binicio rota\b/u,
  /\biniciei rota\b/u,
  /\binicie rota\b/u,
]
/** Palavras que podem acompanhar o comando sem mudar o sentido ("saí para a entrega"). */
const FILLER = new Set([
  'a',
  'agora',
  'ao',
  'cliente',
  'da',
  'de',
  'do',
  'e',
  'entrega',
  'eu',
  'na',
  'no',
  'nf',
  'nota',
  'o',
  'para',
  'parada',
  'pra',
  'rota',
  'viagem',
])

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

  const arrive = words.some((word) => ARRIVE_WORDS.has(word))
  const depart =
    words.some((word) => DEPART_WORDS.has(word)) ||
    DEPART_PHRASES.some((phrase) => phrase.test(normalized))
  if (arrive === depart) return null

  const documentNumbers = words
    .filter((word) => /^\d+$/u.test(word))
    .map((word) => word.replace(/^0+/u, ''))
    .filter((word) => word !== '')
  const rest = words.filter(
    (word) =>
      !/^\d+$/u.test(word) &&
      !ARRIVE_WORDS.has(word) &&
      !DEPART_WORDS.has(word) &&
      !FILLER.has(word) &&
      word !== 'iniciar' &&
      word !== 'inicio' &&
      word !== 'iniciei' &&
      word !== 'inicie',
  )
  if (rest.length > 0) return null
  return {
    documentNumbers,
    event: arrive ? WHATSAPP_DRIVER_STOP_COMMAND.arrive : WHATSAPP_DRIVER_STOP_COMMAND.depart,
  }
}
