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

/**
 * Spec 183 T207: a quantidade atingida com a unidade da nota (specs 166/172). Sem quantidade, nada —
 * o item continua na lista pelo código e pela descrição.
 */
export function formatOccurrenceItemQuantity(
  item: Readonly<{ quantity: null | string; unit: null | string }>,
  formatNumber: (value: string) => string,
): string {
  if (item.quantity === null) return ''
  const quantity = formatNumber(item.quantity)
  return item.unit === null ? quantity : `${quantity} ${item.unit}`
}

/** Spec 183 T801 (P11): no celular, o detalhe vira três abas. */
export const OCCURRENCE_DETAIL_PHONE_TABS = ['summary', 'contractor', 'driver'] as const

export type OccurrenceDetailPhoneTab = (typeof OCCURRENCE_DETAIL_PHONE_TABS)[number]

export type OccurrenceDetailSection =
  | 'case'
  | 'contractorConversation'
  | 'conversations'
  | 'document'
  | 'driverContact'
  | 'driverConversation'
  | 'summary'
  | 'timeline'

/**
 * As seções de cada aba no celular; `null` é a tela larga, com a página inteira na ordem de
 * sempre. As conversas, no celular, se separam por parte: cada aba mostra a sua, sem abas internas.
 */
export function occurrenceDetailSectionsFor(
  tab: OccurrenceDetailPhoneTab | null,
): readonly OccurrenceDetailSection[] {
  if (tab === 'summary') return ['summary', 'document', 'case', 'timeline']
  if (tab === 'contractor') return ['contractorConversation']
  if (tab === 'driver') return ['driverContact', 'driverConversation']
  return ['summary', 'document', 'driverContact', 'case', 'conversations', 'timeline']
}
