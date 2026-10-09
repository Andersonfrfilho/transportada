/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import driverTripEnglishLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTripLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import { createClockOffsetStore } from '@/modules/driver-trip/shared/clockOffset.service'
import { NATIONAL_HOLIDAY_KEYS } from '@/modules/driver-trip/shared/holidayWarning.constant'
import {
  applyClockOffset,
  listHolidayNoticeLines,
  readCorrectedNowMs,
  resolveSaoPauloCivilDate,
} from '@/modules/driver-trip/shared/holidayWarning.service'
import type { HolidayWarning } from '@/modules/driver-trip/shared/driverTrip.types'

/**
 * Spec 252 (T5.4, RF14, CA15, CA17): o aviso de feriado da parada, só informativo. "Hoje" é o dia
 * civil de São Paulo no relógio do aparelho corrigido pelo desvio; passado e malformado não aparecem.
 */
function warning(overrides: Partial<HolidayWarning> = {}): HolidayWarning {
  return {
    cityIbgeCode: 3509502,
    cityName: 'Campinas',
    date: '2026-10-12',
    reasons: [{ name: 'our_lady_of_aparecida', origin: 'code', scope: 'national' }],
    ...overrides,
  }
}

// 2026-10-12T15:00:00Z é 12:00 em São Paulo.
const NOON_IN_SAO_PAULO_MS = Date.parse('2026-10-12T15:00:00.000Z')

describe('dia civil de São Paulo (spec 252 T5.4)', () => {
  test('meio-dia em São Paulo é o mesmo dia', () => {
    expect(resolveSaoPauloCivilDate(NOON_IN_SAO_PAULO_MS)).toBe('2026-10-12')
  })

  test('01h UTC ainda é o dia anterior em São Paulo (UTC-3)', () => {
    expect(resolveSaoPauloCivilDate(Date.parse('2026-10-13T01:00:00.000Z'))).toBe('2026-10-12')
  })

  test('03h UTC já é o dia seguinte em São Paulo', () => {
    expect(resolveSaoPauloCivilDate(Date.parse('2026-10-13T03:00:00.000Z'))).toBe('2026-10-13')
  })

  test('o desvio do servidor corrige o relógio do aparelho adiantado', () => {
    // Aparelho 1 h adiantado sobre a meia-noite de São Paulo: o servidor diz que ainda é dia 12.
    const deviceNowMs = Date.parse('2026-10-13T03:30:00.000Z')
    const correctedNowMs = applyClockOffset({ deviceNowMs, offsetMs: -60 * 60 * 1000 })

    expect(resolveSaoPauloCivilDate(correctedNowMs)).toBe('2026-10-12')
    expect(resolveSaoPauloCivilDate(deviceNowMs)).toBe('2026-10-13')
  })

  test('o relógio corrigido lê o desvio guardado do aparelho', () => {
    const clockOffset = createClockOffsetStore()
    clockOffset.write(3_600_000)

    const correctedNowMs = readCorrectedNowMs(clockOffset)

    expect(correctedNowMs - Date.now()).toBeGreaterThan(3_600_000 - 1_000)
    expect(correctedNowMs - Date.now()).toBeLessThan(3_600_000 + 1_000)
  })

  test('sem desvio guardado o relógio corrigido é o do aparelho', () => {
    const correctedNowMs = readCorrectedNowMs(createClockOffsetStore())

    expect(Math.abs(correctedNowMs - Date.now())).toBeLessThan(1_000)
  })

  test('sem desvio medido o relógio do aparelho vale como está', () => {
    expect(applyClockOffset({ deviceNowMs: 1_000, offsetMs: undefined })).toBe(1_000)
  })
})

describe('linhas do aviso (spec 252 T5.4)', () => {
  test('a data do aviso igual ao dia de hoje é "hoje"', () => {
    const [line] = listHolidayNoticeLines({
      nowMs: NOON_IN_SAO_PAULO_MS,
      warnings: [warning()],
    })

    expect(line).toEqual({
      cityName: 'Campinas',
      dateLabel: '12/10',
      isToday: true,
      reasons: [{ name: 'our_lady_of_aparecida', origin: 'code', scope: 'national' }],
    })
  })

  test('data futura leva o dia e o mês, não "hoje"', () => {
    const [line] = listHolidayNoticeLines({
      nowMs: NOON_IN_SAO_PAULO_MS,
      warnings: [warning({ date: '2026-11-02' })],
    })

    expect(line?.isToday).toBe(false)
    expect(line?.dateLabel).toBe('02/11')
  })

  test('data passada no relógio do aparelho não aparece: o aviso venceu', () => {
    expect(
      listHolidayNoticeLines({
        nowMs: NOON_IN_SAO_PAULO_MS,
        warnings: [warning({ date: '2026-10-11' })],
      }),
    ).toEqual([])
  })

  test.each([[''], ['12/10/2026'], ['2026-13-40'], ['amanhã'], ['2026-10-1']])(
    'data malformada (%p) não vira linha: não inventa',
    (date) => {
      expect(
        listHolidayNoticeLines({ nowMs: NOON_IN_SAO_PAULO_MS, warnings: [warning({ date })] }),
      ).toEqual([])
    },
  )

  test('sem cityName a linha não leva cidade', () => {
    const withoutCity: HolidayWarning = {
      cityIbgeCode: 3509502,
      date: '2026-10-12',
      reasons: [{ name: 'Aniversário da cidade', origin: 'imported', scope: 'municipal' }],
    }

    const [line] = listHolidayNoticeLines({ nowMs: NOON_IN_SAO_PAULO_MS, warnings: [withoutCity] })

    expect(line).toBeDefined()
    expect(line && 'cityName' in line).toBe(false)
  })

  test('cityName em branco conta como ausente', () => {
    const [line] = listHolidayNoticeLines({
      nowMs: NOON_IN_SAO_PAULO_MS,
      warnings: [warning({ cityName: '   ' })],
    })

    expect(line && 'cityName' in line).toBe(false)
  })

  test('campo ausente (snapshot antigo) ou vazio dá lista vazia', () => {
    expect(listHolidayNoticeLines({ nowMs: NOON_IN_SAO_PAULO_MS, warnings: undefined })).toEqual([])
    expect(listHolidayNoticeLines({ nowMs: NOON_IN_SAO_PAULO_MS, warnings: [] })).toEqual([])
  })

  test('a ordem do servidor se mantém e hoje vem antes do futuro só pela ordem recebida', () => {
    const lines = listHolidayNoticeLines({
      nowMs: NOON_IN_SAO_PAULO_MS,
      warnings: [warning({ date: '2026-10-12' }), warning({ date: '2026-10-20' })],
    })

    expect(lines.map((line) => line.dateLabel)).toEqual(['12/10', '20/10'])
  })
})

describe('chaves do feriado nacional (spec 252 T5.4)', () => {
  test('a lista do motorista é a da API', () => {
    const api = readFileSync(
      new URL(
        '../../../api-transportada/src/business-calendar/domain/business-calendar.constant.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const block = /NATIONAL_HOLIDAY_KEY = \{([^}]+)\}/u.exec(api)?.[1] ?? ''
    const apiKeys = [...block.matchAll(/'([^']+)'/gu)].map((match) => match[1] ?? '')

    const driverKeys: readonly string[] = NATIONAL_HOLIDAY_KEYS

    expect(driverKeys.toSorted()).toEqual(apiKeys.toSorted())
  })

  test.each([
    ['pt-BR', driverTripLocale],
    ['en', driverTripEnglishLocale],
  ])('o locale %s traduz toda chave nacional', (_language, locale) => {
    const names: Readonly<Record<string, string>> = locale.holidayWarning.national
    for (const key of NATIONAL_HOLIDAY_KEYS) {
      expect(names[key]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
