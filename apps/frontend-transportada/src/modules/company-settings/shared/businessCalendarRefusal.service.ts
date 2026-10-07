/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BUSINESS_CALENDAR_REFUSAL_CODES } from './businessCalendar.constant'
import { BusinessCalendarRequestError } from './businessCalendarRequest.service'

/** `labelKey` é a chave do rótulo impresso; sem ela, a tela usa o nome cru que a API mandou. */
export type RefusedField = Readonly<{ field: string; labelKey: string | undefined }>

export type BusinessCalendarRefusal = Readonly<{
  code: string
  fields: readonly RefusedField[]
  messageKey: string
}>

const UNKNOWN_CODE = 'UNKNOWN'

/**
 * `web.md` §11.4: o rótulo impresso é o que aparece, nunca o caminho do corpo. O mapa mora aqui, num arquivo
 * só, e **campo sem rótulo conhecido não some do aviso**: sai com o nome que a API usou.
 */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  cityIbgeCode: 'fields.cityIbgeCode',
  day: 'fields.day',
  holidayOn: 'fields.holidayOn',
  kind: 'fields.kind',
  month: 'fields.month',
  name: 'fields.name',
  recurrence: 'fields.recurrence',
  stateIbgeCode: 'fields.stateIbgeCode',
}

function isKnownCode(code: string): boolean {
  return BUSINESS_CALENDAR_REFUSAL_CODES.some((known) => known === code)
}

function describeFields(error: BusinessCalendarRequestError): readonly RefusedField[] {
  const names = [...new Set(error.details.map((detail) => detail.field))]
  return names.map((field) => ({ field, labelKey: FIELD_LABEL_KEYS[field] }))
}

/** Todo erro vira texto: o que não é do transporte também é dito, nunca engolido. */
export function describeBusinessCalendarRefusal(error: unknown): BusinessCalendarRefusal {
  if (!(error instanceof BusinessCalendarRequestError)) {
    return { code: UNKNOWN_CODE, fields: [], messageKey: 'errors.generic' }
  }
  return {
    code: error.code,
    fields: describeFields(error),
    messageKey: isKnownCode(error.code) ? `errors.${error.code}` : 'errors.generic',
  }
}
