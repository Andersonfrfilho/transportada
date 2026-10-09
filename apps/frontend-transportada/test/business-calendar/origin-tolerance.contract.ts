/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 (ADR-0100 §4), PR 1 de produção: o painel aceita `origin` OPCIONAL (`typed` | `imported`) nas listas e
 * nas escritas de feriado municipal e estadual ANTES de a API que o manda chegar — o deploy sobe a API antes do
 * painel. Ausente é a API de hoje; presente e inválido é recusado; chave desconhecida segue recusada.
 */
import { describe, expect, test } from 'bun:test'

import { createBusinessCalendarClient } from '@/modules/company-settings/shared/businessCalendarClient.service'
import {
  isMunicipalHoliday,
  isSavedMunicipalHoliday,
  isStateHoliday,
} from '@/modules/company-settings/shared/businessCalendarGuards.validation'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildSavedHoliday,
  buildYearlyStateHoliday,
  envelope,
} from '../fixtures/businessCalendar.fixture'

const VALID_ORIGINS = ['typed', 'imported'] as const
const INVALID_ORIGINS: readonly unknown[] = ['manual', 'IMPORTED', '', null, 1, true, {}]

function clientAnswering(body: unknown): ReturnType<typeof createBusinessCalendarClient> {
  return createBusinessCalendarClient({
    apiBaseUrl: 'http://api.test',
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    getAccessToken: () => Promise.resolve('token-123'),
  })
}

describe('data fixa municipal com `origin` opcional', () => {
  test('aceita as duas origens e a ausência', () => {
    for (const origin of VALID_ORIGINS) {
      expect(isMunicipalHoliday({ ...buildHoliday(), origin })).toBe(true)
      expect(isSavedMunicipalHoliday({ ...buildSavedHoliday(), origin })).toBe(true)
    }
    expect(isMunicipalHoliday(buildHoliday())).toBe(true)
    expect(isSavedMunicipalHoliday(buildSavedHoliday())).toBe(true)
  })

  test('recusa origem inválida, em qualquer das duas formas', () => {
    for (const origin of INVALID_ORIGINS) {
      expect(isMunicipalHoliday({ ...buildHoliday(), origin })).toBe(false)
      expect(isSavedMunicipalHoliday({ ...buildSavedHoliday(), origin })).toBe(false)
    }
  })

  test('continua recusando chave a mais e chave a menos', () => {
    expect(isMunicipalHoliday({ ...buildHoliday(), companyId: 'company-1', origin: 'typed' })).toBe(
      false,
    )
    expect(isSavedMunicipalHoliday({ ...buildHoliday(), origin: 'typed' })).toBe(false)
  })
})

describe('feriado estadual com `origin` opcional', () => {
  test('aceita as duas origens e a ausência, nas duas formas', () => {
    for (const origin of VALID_ORIGINS) {
      expect(isStateHoliday({ ...buildYearlyStateHoliday(), origin })).toBe(true)
      expect(isStateHoliday({ ...buildOnceStateHoliday(), origin })).toBe(true)
    }
    expect(isStateHoliday(buildYearlyStateHoliday())).toBe(true)
    expect(isStateHoliday(buildOnceStateHoliday())).toBe(true)
  })

  test('recusa origem inválida, nas duas formas', () => {
    for (const origin of INVALID_ORIGINS) {
      expect(isStateHoliday({ ...buildYearlyStateHoliday(), origin })).toBe(false)
      expect(isStateHoliday({ ...buildOnceStateHoliday(), origin })).toBe(false)
    }
  })

  test('a forma errada segue recusada mesmo com origem', () => {
    expect(
      isStateHoliday({ ...buildYearlyStateHoliday(), holidayOn: '2026-07-09', origin: 'typed' }),
    ).toBe(false)
    expect(isStateHoliday({ ...buildOnceStateHoliday(), day: 9, month: 7, origin: 'typed' })).toBe(
      false,
    )
  })
})

describe('o cliente do calendário com a API que já manda `origin`', () => {
  test('as listas devolvem as linhas com a origem', async () => {
    const municipal = [{ ...buildHoliday(), origin: 'imported' }]
    const state = [{ ...buildOnceStateHoliday(), origin: 'imported' }, buildYearlyStateHoliday()]

    expect(await clientAnswering(envelope(municipal)).listMunicipalHolidays()).toEqual(
      municipal as never,
    )
    expect(await clientAnswering(envelope(state)).listStateHolidays()).toEqual(state as never)
  })

  test('POST e PATCH de data fixa e estadual aceitam a resposta com origem', async () => {
    const saved = { ...buildSavedHoliday(), origin: 'typed' }
    const state = { ...buildOnceStateHoliday(), origin: 'typed' }

    expect(
      await clientAnswering(envelope(saved)).saveMunicipalHoliday({
        cityIbgeCode: saved.cityIbgeCode,
        holidayOn: saved.holidayOn,
        kind: saved.kind,
        name: saved.name,
      }),
    ).toEqual(saved as never)
    expect(
      await clientAnswering(envelope(saved)).updateMunicipalHoliday({
        changes: { name: 'Outro nome' },
        id: saved.id,
      }),
    ).toEqual(saved as never)
    expect(
      await clientAnswering(envelope(state)).updateStateHoliday({
        changes: { name: 'Outro nome', recurrence: 'once' },
        id: state.id,
      }),
    ).toEqual(state as never)
  })

  test('origem inválida na lista é recusada, não engolida', async () => {
    const answer = envelope([{ ...buildHoliday(), origin: 'manual' }])

    await expect(clientAnswering(answer).listMunicipalHolidays()).rejects.toBeDefined()
  })
})
