/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  BRAZILIAN_STATES,
  BUSINESS_CALENDAR_TIME_ZONE,
  STATE_CODE_LENGTH,
} from './businessCalendar.constant'
import type { HolidayImportScope } from './holidayImport.types'

const ENGLISH_LANGUAGE = 'en'
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

type Formatting = Readonly<{ language: string; value: string }>

function localeOf(language: string): string {
  return language.startsWith(ENGLISH_LANGUAGE) ? 'en-US' : 'pt-BR'
}

/** Data de calendário (`AAAA-MM-DD`): separada em partes, nunca por `new Date(texto)`, que voltaria um dia em SP. */
export function formatCivilDate({ language, value }: Formatting): string {
  const parts = CIVIL_DATE_PATTERN.exec(value)
  if (parts === null) return value
  const [, year, month, day] = parts
  return language.startsWith(ENGLISH_LANGUAGE)
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`
}

function formatInstant(input: Formatting & Readonly<{ withTime: boolean }>): string {
  const date = new Date(input.value)
  if (Number.isNaN(date.getTime())) return input.value
  return new Intl.DateTimeFormat(localeOf(input.language), {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_CALENDAR_TIME_ZONE,
    year: 'numeric',
    ...(input.withTime ? { hour: '2-digit', hour12: false, minute: '2-digit' } : {}),
  }).format(date)
}

/** O dia em que algo aconteceu, no fuso da empresa (o servidor manda o instante em UTC). */
export function formatInstantDate(input: Formatting): string {
  return formatInstant({ ...input, withTime: false })
}

export function formatInstantDateTime(input: Formatting): string {
  return formatInstant({ ...input, withTime: true })
}

export type HolidayPlace = Readonly<{ ibgeCode: string; scope: HolidayImportScope }>

/** O estado pela sigla; a cidade pelo nome do IBGE quando a lista chegou, senão pelo código — nunca vazio. */
export function labelHolidayPlace(
  input: Readonly<{ cityNames: ReadonlyMap<string, string>; place: HolidayPlace }>,
): string {
  const { cityNames, place } = input
  if (place.scope === 'city') return cityNames.get(place.ibgeCode) ?? place.ibgeCode
  return BRAZILIAN_STATES.find((state) => state.code === place.ibgeCode)?.acronym ?? place.ibgeCode
}

/** O prefixo de UF de cada cidade: é por UF que a lista de municípios do IBGE se pede. */
export function cityStateCodesOf(places: readonly HolidayPlace[]): readonly string[] {
  return places
    .filter((place) => place.scope === 'city')
    .map((place) => place.ibgeCode.slice(0, STATE_CODE_LENGTH))
}
