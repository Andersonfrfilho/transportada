/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: o bot do grupo cumprimenta como gente. O pedido aberto começa com "Boa noite, Anderson!"
 * e termina com "Tenha uma boa noite!", pela hora de Brasília (a hora do motorista, não a do servidor).
 */

/** A hora do motorista: o bot fala com transportadoras do Brasil. */
const BOT_TIME_ZONE = 'America/Sao_Paulo'

type DayPart = 'afternoon' | 'morning' | 'night'

export function dayPartOf(now: Date): DayPart {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: BOT_TIME_ZONE })
      .format(now)
      .replace(/\D/gu, ''),
  )
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'night'
}

const GREETING: Record<DayPart, string> = {
  afternoon: 'Boa tarde',
  morning: 'Bom dia',
  night: 'Boa noite',
}

const FAREWELL: Record<DayPart, string> = {
  afternoon: 'Tenha uma boa tarde! ☀️',
  morning: 'Tenha um bom dia! ☀️',
  night: 'Tenha uma boa noite! 🌙',
}

/** O primeiro nome do WhatsApp, sem emoji nem sobrenome; vazio quando não há um nome legível. */
function firstNameOf(senderName: null | string): string {
  const words = (senderName ?? '')
    .split(/\s+/u)
    .map((word) => word.replace(/[^\p{L}'-]/gu, ''))
    .filter((word) => word.length > 0)
  const first = words[0] ?? ''
  return first.length >= 2 ? first : ''
}

/** "Boa noite, Anderson! 👋" (ou só "Boa noite! 👋" sem nome). */
export function botGreeting(now: Date, senderName: null | string): string {
  const name = firstNameOf(senderName)
  return `${GREETING[dayPartOf(now)]}${name === '' ? '' : `, ${name}`}! 👋`
}

export function botFarewell(now: Date): string {
  return FAREWELL[dayPartOf(now)]
}
