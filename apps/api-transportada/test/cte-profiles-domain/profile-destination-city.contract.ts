/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  canShareMatcher,
  cityKey,
  explainEmissionProfile,
  resolveEmissionProfile,
} from '../../src/cte-profiles/domain/emission-profile-resolution.policy.js'
import { expectApiErrorCode } from './support.js'

const UNICA_TAX_ID = '26344834000108'
const RECIPIENT_TAX_ID = '19354980000159'

const profile = (
  id: string,
  destinationCities: readonly string[] | null | undefined,
  overrides: Record<string, unknown> = {},
) =>
  ({
    destinationCities,
    id,
    matchMode: 'sender_tax_id',
    matchers: [{ matchRole: 'sender', taxId: UNICA_TAX_ID }],
    name: id,
    priority: 10n,
    status: 'active',
    ...overrides,
  }) as const

const ribeirao = profile('rp', [cityKey('Ribeirão Preto', 'SP'), cityKey('Itápolis', 'SP')])
const rioPreto = profile('sjrp', [cityKey('SÃO JOSE DO RIO PRETO', 'sp'), cityKey('Adolfo', 'SP')])
const invoice = (recipientCityKey: string | null | undefined) => ({
  recipientCityKey,
  recipientTaxId: RECIPIENT_TAX_ID,
  senderTaxId: UNICA_TAX_ID,
})

describe('perfil de CT-e por cidade de destino (spec 312)', () => {
  test('a chave da cidade ignora acento, caixa, espaço repetido e traz a UF', () => {
    expect(cityKey('  São  José do Rio Preto ', 'sp')).toBe('SAO JOSE DO RIO PRETO|SP')
    expect(cityKey("Aparecida d'Oeste", 'SP')).toBe("APARECIDA D'OESTE|SP")
  })

  test('cada perfil rege só as cidades da sua região', () => {
    const profiles = [ribeirao, rioPreto]
    const pick = (city: string) =>
      resolveEmissionProfile({ invoice: invoice(cityKey(city, 'SP')), profiles }).profileId
    expect(pick('Ribeirao Preto')).toBe('rp')
    expect(pick('ITAPOLIS')).toBe('rp')
    expect(pick('Adolfo')).toBe('sjrp')
    expect(pick('São José do Rio Preto')).toBe('sjrp')
  })

  test('cidade fora das listas não casa e o motivo diz que a cidade não é coberta', () => {
    const profiles = [ribeirao, rioPreto]
    expect(explainEmissionProfile({ invoice: invoice(cityKey('Bauru', 'SP')), profiles })).toEqual({
      reason: 'city_not_covered',
    })
    expectApiErrorCode(
      () => resolveEmissionProfile({ invoice: invoice(cityKey('Bauru', 'SP')), profiles }),
      'CTE_PROFILE_CITY_NOT_COVERED',
    )
  })

  test('nota sem cidade conhecida não casa perfil que restringe a cidade', () => {
    expect(explainEmissionProfile({ invoice: invoice(null), profiles: [ribeirao] })).toEqual({
      reason: 'city_not_covered',
    })
    expect(explainEmissionProfile({ invoice: invoice(undefined), profiles: [ribeirao] })).toEqual({
      reason: 'city_not_covered',
    })
  })

  test('perfil sem lista de cidades casa como antes, com ou sem cidade na nota', () => {
    for (const withoutList of [profile('spani', null), profile('spani', undefined)]) {
      for (const cityKeyOfInvoice of [cityKey('Bauru', 'SP'), null, undefined]) {
        expect(
          resolveEmissionProfile({
            invoice: invoice(cityKeyOfInvoice),
            profiles: [withoutList],
          }).profileId,
        ).toBe('spani')
      }
    }
  })

  test('lista vazia não casa nenhuma cidade', () => {
    expect(
      explainEmissionProfile({
        invoice: invoice(cityKey('Adolfo', 'SP')),
        profiles: [profile('x', [])],
      }),
    ).toEqual({ reason: 'city_not_covered' })
  })

  test('sem nenhum perfil para o CNPJ o motivo continua sendo unmatched', () => {
    expect(
      explainEmissionProfile({
        invoice: { ...invoice(cityKey('Adolfo', 'SP')), senderTaxId: '05868574001090' },
        profiles: [ribeirao],
      }),
    ).toEqual({ reason: 'unmatched' })
  })

  test('dois perfis cobrindo a mesma cidade empatam como antes', () => {
    expect(
      explainEmissionProfile({
        invoice: invoice(cityKey('Adolfo', 'SP')),
        profiles: [rioPreto, profile('dup', [cityKey('Adolfo', 'SP')])],
      }),
    ).toEqual({ reason: 'ambiguous' })
  })
})

describe('matcher shared by regional profiles (spec 312)', () => {
  test('two profiles may share a tax id only with disjoint city lists', () => {
    expect(canShareMatcher(['A|SP'], ['B|SP'])).toBe(true)
    expect(canShareMatcher(['A|SP', 'B|SP'], ['B|SP'])).toBe(false)
    expect(canShareMatcher(null, ['B|SP'])).toBe(false)
    expect(canShareMatcher(['A|SP'], null)).toBe(false)
    expect(canShareMatcher(undefined, undefined)).toBe(false)
  })
})
