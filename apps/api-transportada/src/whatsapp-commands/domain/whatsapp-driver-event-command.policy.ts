/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T14 — **o comando direto do motorista** ("saí", "cheguei", "entreguei 17234", "devolvi
 * 17234 ausente"), interpretado num lugar só. Função pura sobre o texto: a conversa individual
 * (spec 144) e o grupo do motorista (spec 292, T12/T13) chamam o mesmo interpretador, para não haver
 * duas gramáticas. Quem decide a parada, a nota e o que registrar é o chamador.
 *
 * Só reconhece o comando inteiro — "sair" sozinho, por exemplo, nunca é "saí": no grupo é o cancelar
 * do pedido. O texto livre que não for comando devolve `undefined` e segue o fluxo de sempre.
 */
import { interpretDriverStopCommand, isWordOf } from './whatsapp-driver-command.policy.js'
import type { DriverReturnReason } from '../../trips/domain/driver-return-reason.policy.js'

/** Teto de notas por mensagem (spec 293, regra 8). */
export const WHATSAPP_DRIVER_COMMAND_MAX_DOCUMENTS = 8

export type WhatsAppDriverEventCommand =
  | { readonly kind: 'arrive' }
  | { readonly kind: 'depart' }
  /** `numbers` vazio é "entreguei" sem nota: o chamador abre a lista de notas. */
  | { readonly kind: 'deliver'; readonly numbers: readonly string[] }
  | {
      readonly kind: 'return'
      readonly numbers: readonly string[]
      readonly reason?: DriverReturnReason
    }
  /** Mais notas que o teto da mensagem. */
  | { readonly kind: 'too_many_documents' }

const DELIVER_WORDS: ReadonlySet<string> = new Set([
  'entreguei',
  'entregue',
  'entregar',
  'entregei',
])
const FIRST_WORD = /^(\S+)(?: (.+))?$/u
const RETURN_VERB = /^(devolvi|devolver|devolucao)(?: (.+))?$/u

const REASON_WORDS: readonly (readonly [RegExp, DriverReturnReason])[] = [
  [/\b(ausente|nao tinha ninguem|ninguem)\b/u, 'recipient_absent'],
  [/\b(recusou|recusa|recusado|nao quis)\b/u, 'recipient_refused'],
  [/\b(endereco|nao achei|nao encontrei)\b/u, 'address_not_found'],
  [/\b(avaria|avariada|avariado|quebrada|danificada)\b/u, 'damaged_goods'],
  [/\b(fechado|fechada)\b/u, 'establishment_closed'],
]

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ,;]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function extractNumbers(rest: string): string[] {
  const numbers = rest.match(/\b\d{1,9}\b/gu) ?? []
  return [...new Set(numbers)]
}

export function interpretWhatsAppDriverEventCommand(
  text: string,
): WhatsAppDriverEventCommand | undefined {
  const normalized = normalize(text)
  if (normalized === '' || normalized.length > 120) return undefined

  // saí/cheguei: o interpretador compartilhado com o grupo (T12).
  const stop = interpretDriverStopCommand(text)
  if (stop !== null) return { kind: stop.event }

  const deliver = FIRST_WORD.exec(normalized)
  if (deliver !== null && isWordOf(deliver[1] ?? '', DELIVER_WORDS)) {
    const numbers = extractNumbers(deliver[2] ?? '')
    if (numbers.length > WHATSAPP_DRIVER_COMMAND_MAX_DOCUMENTS)
      return { kind: 'too_many_documents' }
    return { kind: 'deliver', numbers }
  }

  const returned = RETURN_VERB.exec(normalized)
  if (returned !== null) {
    const rest = returned[2] ?? ''
    const numbers = extractNumbers(rest)
    if (numbers.length > WHATSAPP_DRIVER_COMMAND_MAX_DOCUMENTS)
      return { kind: 'too_many_documents' }
    const reason = REASON_WORDS.find(([pattern]) => pattern.test(rest))?.[1]
    return reason === undefined ? { kind: 'return', numbers } : { kind: 'return', numbers, reason }
  }
  return undefined
}
