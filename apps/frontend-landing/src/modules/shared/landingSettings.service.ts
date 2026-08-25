/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sanitizeAccentColor, sanitizeOptionalText } from './landingSettings.validation'

const PUBLIC_LANDING_SETTINGS_PATH = '/public/landing-settings'

export type LandingGroupUnit = Readonly<{
  city: string
  complement: string
  district: string
  number: string
  phone: string
  postalCode: string
  state: string
  street: string
  tradeName: string
}>

export type LandingSettings = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: Readonly<Record<string, unknown>>
  units: readonly LandingGroupUnit[]
}>

/** Sem linha configurada ou fetch fora do ar, a página serve o padrão — nunca quebra por isso. */
export const DEFAULT_LANDING_SETTINGS: LandingSettings = {
  accentColor: undefined,
  brandName: undefined,
  contactEmail: undefined,
  contactPhone: undefined,
  sections: {},
  units: [],
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
  const units = Array.isArray(record.units) ? record.units.map(sanitizeUnit).filter((unit): unit is LandingGroupUnit => unit !== undefined) : []

  return {
    accentColor: sanitizeAccentColor(record.accentColor),
    brandName: sanitizeOptionalText(record.brandName),
    contactEmail: sanitizeOptionalText(record.contactEmail),
    contactPhone: sanitizeOptionalText(record.contactPhone),
    sections:
      typeof record.sections === 'object' && record.sections !== null
        ? (record.sections as Record<string, unknown>)
        : {},
    units,
  }
}

export async function fetchLandingSettings(input: Readonly<{ apiBaseUrl: string }>): Promise<LandingSettings> {
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
