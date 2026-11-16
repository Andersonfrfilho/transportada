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

/** O nome em minúsculas ou MAIÚSCULAS do cadastro vira "Andreia"; o do WhatsApp só entra se não há cadastro. */
export function registeredFirstName(name: null | string): string {
  const first = firstNameOf(name)
  return first === ''
    ? ''
    : `${first.charAt(0).toLocaleUpperCase('pt-BR')}${first.slice(1).toLocaleLowerCase('pt-BR')}`
}

/** Quem tem mais de um perfil ouve em qual deles o bot está atendendo agora; um perfil só não precisa. */
export function botProfileLine(
  profiles: {
    readonly isDriver: boolean
    readonly isOffice: boolean
  },
  options: { readonly isDirect?: boolean } = {},
): null | string {
  if (!(profiles.isDriver && profiles.isOffice)) return null
  if (options.isDirect === true) {
    return '_Vi que você é motorista e também do escritório. Para contas e boletos, digite *menu*; para a viagem, siga por aqui._'
  }
  return '_Vi que você é motorista e também do escritório. Aqui no grupo eu atendo como *motorista*; para o escritório (contas, boletos), me chame no privado e digite *menu*._'
}

export function botFarewell(now: Date): string {
  return FAREWELL[dayPartOf(now)]
}
