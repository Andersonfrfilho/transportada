/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF22: a resposta numerada ("1", "2") ou falada ("um", "dois", "sim", "não", "pular") a uma pergunta
 * do bot, igual no grupo e na conversa individual. A fala só vale curta: frase longa com palavra fora do
 * vocabulário, ou com sim e não juntos, não responde (é uma mensagem nova).
 */
import { normalizeDriverCommandText } from './whatsapp-driver-command.policy.js'

export const DRIVER_CHOICE = { first: 'first', second: 'second', skip: 'skip' } as const

export type DriverChoice = (typeof DRIVER_CHOICE)[keyof typeof DRIVER_CHOICE]

const FIRST_WORDS = new Set([
  '1',
  'um',
  'uma',
  'sim',
  's',
  'ok',
  'claro',
  'confirmo',
  'confirma',
  'pode',
  'quero',
  'primeira',
  'trocar',
  'troca',
])
const SECOND_WORDS = new Set([
  '2',
  'dois',
  'duas',
  'nao',
  'n',
  'segunda',
  'engano',
  'descartar',
  'descarta',
])
const SKIP_WORDS = new Set(['pular', 'pula', 'pulo'])
const NEUTRAL_WORDS = new Set([
  'opcao',
  'numero',
  'a',
  'o',
  'e',
  'por',
  'favor',
  'mesmo',
  'agora',
  'foi',
])
const MAX_WORDS = 4

/** `undefined` quando a fala não é uma resposta curta ao "1 / 2" (ou ao "pular"). */
export function interpretDriverChoice(text: string): DriverChoice | undefined {
  const words = normalizeDriverCommandText(text)
    .split(' ')
    .filter((word) => word !== '' && !NEUTRAL_WORDS.has(word))
  if (words.length === 0 || words.length > MAX_WORDS) return undefined
  const known = (word: string) =>
    FIRST_WORDS.has(word) || SECOND_WORDS.has(word) || SKIP_WORDS.has(word)
  if (!words.every(known)) return undefined
  const isFirst = words.some((word) => FIRST_WORDS.has(word))
  const isSecond = words.some((word) => SECOND_WORDS.has(word))
  const isSkip = words.some((word) => SKIP_WORDS.has(word))
  if (Number(isFirst) + Number(isSecond) + Number(isSkip) !== 1) return undefined
  if (isFirst) return DRIVER_CHOICE.first
  return isSecond ? DRIVER_CHOICE.second : DRIVER_CHOICE.skip
}

const CANCEL_WORDS = new Set(['cancelar', 'cancela', 'cancele', 'cancelado', 'sair', 'parar'])
const CANCEL_MAX_LENGTH = 30
/** Pedidos para voltar ao menu: com pergunta aberta, saem de cena em vez de serem repetidos. */
const ESCAPE_WORDS = new Set(['menu', 'ajuda', 'voltar', 'inicio'])

/** "Cancelar" (curto): quem fez a pergunta aberta é quem encerra. O mesmo no grupo e na conversa individual. */
export function isDriverCancelText(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z ]/gu, ' ')
    .trim()
  return (
    normalized.split(/\s+/u).some((word) => CANCEL_WORDS.has(word)) &&
    normalized.length <= CANCEL_MAX_LENGTH
  )
}

/** "menu", "ajuda", "voltar": a pessoa quer sair da pergunta aberta. */
export function isDriverEscapeText(text: string): boolean {
  return ESCAPE_WORDS.has(normalizeDriverCommandText(text))
}
