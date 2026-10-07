/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (`web.md` §11): a recusa do servidor nomeia TODOS os campos, uma vez cada, pelo rótulo impresso;
 * campo desconhecido sai com o nome cru; recusa sem campo não inventa lista; e todo código tem texto.
 */
import { describe, expect, test } from 'bun:test'

import { BUSINESS_CALENDAR_REFUSAL_CODES } from '@/modules/company-settings/shared/businessCalendar.constant'
import { describeBusinessCalendarRefusal } from '@/modules/company-settings/shared/businessCalendarRefusal.service'
import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

const KNOWN_CODES: readonly string[] = BUSINESS_CALENDAR_REFUSAL_CODES

function refusalWith(
  details: readonly { field: string; message: string }[],
  code = 'INVALID_REQUEST',
): ReturnType<typeof describeBusinessCalendarRefusal> {
  return describeBusinessCalendarRefusal(
    new BusinessCalendarRequestError({ code, details, status: 400 }),
  )
}

describe('campos recusados', () => {
  test('lista todos de uma vez, com o rótulo impresso e sem repetir', () => {
    const refusal = refusalWith([
      { field: 'day', message: 'The day does not exist in the month' },
      { field: 'name', message: 'Too small' },
      { field: 'day', message: 'Too big' },
      { field: 'cityIbgeCode', message: 'is invalid' },
    ])

    expect(refusal.fields).toEqual([
      { field: 'day', labelKey: 'fields.day' },
      { field: 'name', labelKey: 'fields.name' },
      { field: 'cityIbgeCode', labelKey: 'fields.cityIbgeCode' },
    ])
    expect(refusal.messageKey).toBe('errors.INVALID_REQUEST')
  })

  test('cada campo da API que o formulário tem ganha rótulo', () => {
    const fields = [
      'cityIbgeCode',
      'day',
      'holidayOn',
      'kind',
      'month',
      'name',
      'recurrence',
      'stateIbgeCode',
    ]

    expect(refusalWith(fields.map((field) => ({ field, message: 'x' }))).fields).toEqual(
      fields.map((field) => ({ field, labelKey: `fields.${field}` })),
    )
  })

  test('campo sem rótulo conhecido NÃO some: sai com o nome que a API usou', () => {
    const refusal = refusalWith([{ field: 'extraThing', message: 'x' }])

    expect(refusal.fields).toEqual([{ field: 'extraThing', labelKey: undefined }])
  })

  test('recusa sem campo algum não inventa a lista', () => {
    expect(refusalWith([]).fields).toEqual([])
  })
})

describe('código de cada recusa', () => {
  test('código conhecido aponta o texto dele', () => {
    const refusal = describeBusinessCalendarRefusal(
      new BusinessCalendarRequestError({ code: 'STATE_HOLIDAY_CONFLICT', status: 409 }),
    )

    expect(refusal.messageKey).toBe('errors.STATE_HOLIDAY_CONFLICT')
    expect(refusal.code).toBe('STATE_HOLIDAY_CONFLICT')
  })

  test('código que a tela não conhece cai no texto genérico, sem perder o código', () => {
    const refusal = describeBusinessCalendarRefusal(
      new BusinessCalendarRequestError({ code: 'SOMETHING_NEW', status: 409 }),
    )

    expect(refusal.messageKey).toBe('errors.generic')
    expect(refusal.code).toBe('SOMETHING_NEW')
  })

  test('erro que não é do transporte também é dito, nunca engolido', () => {
    const refusal = describeBusinessCalendarRefusal(new TypeError('boom'))

    expect(refusal.messageKey).toBe('errors.generic')
    expect(refusal.fields).toEqual([])
  })

  test('a lista de códigos tem os da T1.3, os da política e os de transporte', () => {
    for (const code of [
      'MUNICIPAL_HOLIDAY_RULE_CONFLICT',
      'MUNICIPAL_HOLIDAY_RULE_NOT_FOUND',
      'MUNICIPAL_HOLIDAY_RULE_INVALID_DAY',
      'MUNICIPAL_HOLIDAY_GENERATED_BY_RULE',
      'MUNICIPAL_HOLIDAY_NOT_FOUND',
      'STATE_HOLIDAY_CONFLICT',
      'STATE_HOLIDAY_NOT_FOUND',
      'STATE_HOLIDAY_RECURRENCE_MISMATCH',
      'BUSINESS_CALENDAR_COVERAGE_TOO_WIDE',
      'BUSINESS_CALENDAR_INVALID_CITY',
      'BUSINESS_CALENDAR_INVALID_COVERAGE',
      'BUSINESS_CALENDAR_INVALID_DATE',
      'BUSINESS_CALENDAR_INVALID_DAYS',
      'BUSINESS_CALENDAR_INVALID_RULE',
      'BUSINESS_CALENDAR_OUT_OF_COVERAGE',
      'BUSINESS_CALENDAR_TOO_MANY_RULES',
      'BUSINESS_CALENDAR_UNKNOWN_STATE',
      'INVALID_REQUEST',
      'FORBIDDEN',
      'UNAUTHENTICATED',
      'TOO_MANY_REQUESTS',
      'DATABASE_UNAVAILABLE',
      'BUSINESS_CALENDAR_NETWORK_ERROR',
      'BUSINESS_CALENDAR_REQUEST_FAILED',
      'BUSINESS_CALENDAR_RESPONSE_INVALID',
    ]) {
      expect(KNOWN_CODES).toContain(code)
    }
  })
})
