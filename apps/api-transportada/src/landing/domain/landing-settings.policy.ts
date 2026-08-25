/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { LANDING_ACCENT_COLOR_PATTERN } from '../../database/landing.schema.js'

export type LandingSections = Readonly<Record<string, unknown>>

export type LandingSettingsInput = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: LandingSections
}>

/** Marcação aceita no texto de seção: apenas `*` (negrito) e `_` (itálico), como em `conversation-flow.md`. */
const ALLOWED_MARKUP_PATTERN = /[^\P{C}]/gu

export class InvalidLandingAccentColorError extends Error {
  public constructor() {
    super('accent color must be a 6-digit hex value, e.g. #1a2b3c')
    this.name = 'InvalidLandingAccentColorError'
  }
}

/**
 * A escrita sanitiza — nunca a leitura. Hex fora do formato recusa o `PUT` inteiro (o operador
 * corrige na hora), e texto livre perde apenas caracteres de controle; a marcação `*`/`_` que o
 * cliente de mensagem já entende passa direto, como em `conversation-flow.md` §4.
 */
export function sanitizeLandingSettingsInput(input: LandingSettingsInput): LandingSettingsInput {
  if (input.accentColor !== undefined && !LANDING_ACCENT_COLOR_PATTERN.test(input.accentColor)) {
    throw new InvalidLandingAccentColorError()
  }

  return {
    accentColor: input.accentColor,
    brandName: sanitizePlainText(input.brandName),
    contactEmail: sanitizePlainText(input.contactEmail),
    contactPhone: sanitizePlainText(input.contactPhone),
    sections: sanitizeSections(input.sections),
  }
}

function sanitizePlainText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.replace(ALLOWED_MARKUP_PATTERN, '').trim()
}

function sanitizeSections(sections: LandingSections): LandingSections {
  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, sanitizeSectionValue(value)]),
  )
}

function sanitizeSectionValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizePlainText(value)
  if (Array.isArray(value)) return value.map(sanitizeSectionValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeSectionValue(entry),
      ]),
    )
  }
  return value
}
