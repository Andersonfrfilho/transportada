/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sanitizeAccentColor, sanitizeOptionalText } from './landingSettings.validation'

const PUBLIC_LANDING_SETTINGS_PATH = '/public/landing-settings'

export type LandingGroupUnit = Readonly<{
  city: string
  companyId: string
  complement: string
  district: string
  number: string
  phone: string
  postalCode: string
  state: string
  street: string
  tradeName: string
}>

/** Spec 068 — a lista de contatos da empresa, com a marca de WhatsApp, e os perfis de rede. */
export type LandingContact = Readonly<{
  isWhatsapp: boolean
  kind: 'phone' | 'email'
  label: string
  value: string
}>

export type LandingSocialLink = Readonly<{
  network: string
  url: string
}>

export type LandingSettings = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contacts: readonly LandingContact[]
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: Readonly<Record<string, unknown>>
  socialLinks: readonly LandingSocialLink[]
  units: readonly LandingGroupUnit[]
}>

/** Sem linha configurada ou fetch fora do ar, a página serve o padrão — nunca quebra por isso. */
export const DEFAULT_LANDING_SETTINGS: LandingSettings = {
  accentColor: undefined,
  brandName: undefined,
  contacts: [],
  contactEmail: undefined,
  contactPhone: undefined,
  sections: {},
  socialLinks: [],
  units: [],
}

/** Item sem forma de contato é descartado, não interpretado: a rota é entrada de fronteira. */
function sanitizeContact(value: unknown): LandingContact | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const kind = record.kind
  if ((kind !== 'phone' && kind !== 'email') || typeof record.value !== 'string') return undefined
  if (record.value.trim() === '') return undefined

  return {
    isWhatsapp: kind === 'phone' && record.isWhatsapp === true,
    kind,
    label: typeof record.label === 'string' ? record.label : '',
    value: record.value,
  }
}

function sanitizeSocialLink(value: unknown): LandingSocialLink | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.network !== 'string' || typeof record.url !== 'string') return undefined
  /* `https` e nada mais: a página é servida por `https`, e link de `http` é aviso do navegador. */
  return record.url.startsWith('https://')
    ? { network: record.network, url: record.url }
    : undefined
}

/** Só dígito no `tel:`/`wa.me`; a máscara é a que o operador digitou. */
export function toContactHref(contact: LandingContact): string {
  if (contact.kind === 'email') return `mailto:${contact.value}`
  return `tel:+${contact.value.replaceAll(/\D/gu, '')}`
}

export function toWhatsappHref(contact: LandingContact): string {
  return `https://wa.me/${contact.value.replaceAll(/\D/gu, '')}`
}

const SOCIAL_LABELS: Readonly<Record<string, string>> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  website: 'Site',
  x: 'X',
  youtube: 'YouTube',
}

/** Rede desconhecida sai com o nome que veio: catálogo novo no cadastro não some do rodapé. */
export function toSocialLabel(network: string): string {
  return SOCIAL_LABELS[network] ?? network
}

function sanitizeUnit(value: unknown): LandingGroupUnit | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const text = (key: string): string => {
    const fieldValue = record[key]
    return typeof fieldValue === 'string' ? fieldValue : ''
  }

  return {
    city: text('city'),
    companyId: text('companyId'),
    complement: text('complement'),
    district: text('district'),
    number: text('number'),
    phone: text('phone'),
    postalCode: text('postalCode'),
    state: text('state'),
    street: text('street'),
    tradeName: text('tradeName'),
  }
}

function sanitizeSettings(value: unknown): LandingSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_LANDING_SETTINGS
  const record = value as Record<string, unknown>
  const units = Array.isArray(record.units)
    ? record.units.map(sanitizeUnit).filter((unit): unit is LandingGroupUnit => unit !== undefined)
    : []

  const contacts = Array.isArray(record.contacts)
    ? record.contacts
        .map(sanitizeContact)
        .filter((contact): contact is LandingContact => contact !== undefined)
    : []
  const socialLinks = Array.isArray(record.socialLinks)
    ? record.socialLinks
        .map(sanitizeSocialLink)
        .filter((link): link is LandingSocialLink => link !== undefined)
    : []

  return {
    accentColor: sanitizeAccentColor(record.accentColor),
    brandName: sanitizeOptionalText(record.brandName),
    contacts,
    socialLinks,
    contactEmail: sanitizeOptionalText(record.contactEmail),
    contactPhone: sanitizeOptionalText(record.contactPhone),
    sections:
      typeof record.sections === 'object' && record.sections !== null
        ? (record.sections as Record<string, unknown>)
        : {},
    units,
  }
}

export async function fetchLandingSettings(
  input: Readonly<{ apiBaseUrl: string }>,
): Promise<LandingSettings> {
  try {
    const response = await fetch(`${input.apiBaseUrl}${PUBLIC_LANDING_SETTINGS_PATH}`, {
      cache: 'no-store',
      method: 'GET',
    })
    if (!response.ok) return DEFAULT_LANDING_SETTINGS

    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return DEFAULT_LANDING_SETTINGS
    return sanitizeSettings((body as Record<string, unknown>).data)
  } catch {
    // Ausência de rede não quebra a landing: ela serve o padrão até o próximo refetch.
    return DEFAULT_LANDING_SETTINGS
  }
}
