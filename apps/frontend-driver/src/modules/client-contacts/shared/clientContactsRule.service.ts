/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ClientChannelValue, ClientContactChannel } from './clientContacts.types'

/**
 * Spec 281 T8b: o tipo pede o contato na abertura quando liga o pedido e o canal com o cliente não está desligado. O
 * app lê o que o servidor resolveu (`asksClientContact`, `clientChannel`); quem cobra é a API.
 */
export function resolveAskedContactChannels(type: {
  readonly asksClientContact?: boolean
  readonly clientChannel?: ClientChannelValue
}): readonly ClientContactChannel[] {
  if (type.asksClientContact !== true) return []
  switch (type.clientChannel ?? 'email') {
    case 'off':
      return []
    case 'whatsapp':
      return ['whatsapp']
    case 'both':
      return ['email', 'whatsapp']
    default:
      return ['email']
  }
}

/** Mesma guarda de forma do servidor (`ADDRESS_PATTERN`); a API valida de verdade. */
const EMAIL_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/u

export function parseClientEmail(raw: string): null | string {
  const address = raw.trim()
  return address.length <= 254 && EMAIL_PATTERN.test(address) ? address : null
}
