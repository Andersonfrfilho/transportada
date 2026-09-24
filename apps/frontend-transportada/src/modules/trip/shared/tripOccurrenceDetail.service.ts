/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripOccurrenceDetailDriver } from './tripOccurrenceFeed.service'

export type OccurrenceDriverContact = Readonly<{
  emailHref: null | string
  initials: string
  name: string
  phone: string
  pictureUrl: null | string
  telHref: null | string
  whatsappHref: null | string
}>

/** Duas letras: primeira e última palavra do nome — o avatar quando não há foto. */
function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== '')
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toLocaleUpperCase('pt-BR')
}

/**
 * Spec 183 P2: o contato do motorista vira **ação** — ligar, abrir o WhatsApp, escrever. Ligar e
 * WhatsApp saem do produto (`tel:` e `wa.me`, spec 183 fora do escopo). O WhatsApp só aparece com o
 * telefone verificado; o telefone da ficha sozinho não prova que a pessoa tem WhatsApp nele.
 */
export function buildOccurrenceDriverContact(
  input: Readonly<{ apiUrl: string; driver: null | TripOccurrenceDetailDriver }>,
): null | OccurrenceDriverContact {
  const { driver } = input
  if (driver === null) return null
  return {
    emailHref: driver.email === '' ? null : `mailto:${driver.email}`,
    initials: initialsOf(driver.name),
    name: driver.name,
    phone: driver.phone,
    pictureUrl:
      driver.picturePath === null
        ? null
        : `${input.apiUrl.replace(/\/$/, '')}${driver.picturePath}`,
    telHref: driver.phone === '' ? null : `tel:${driver.phone}`,
    whatsappHref:
      driver.whatsappPhone === null
        ? null
        : `https://wa.me/${driver.whatsappPhone.replace(/\D/gu, '')}`,
  }
}
