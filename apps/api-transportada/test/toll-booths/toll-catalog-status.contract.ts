/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O catálogo vazio (`toll_booths` sem seed) não é "sem pedágio na rota", e catálogo velho não avisa
 * ninguém sozinho — a tarifa reajusta uma vez por ano. `resolveTollCatalogStatus` é a política pura
 * que decide `empty` | `stale` | `current` a partir do resumo já lido.
 */
import { describe, expect, test } from 'bun:test'

import { resolveTollCatalogStatus } from '../../src/toll-booths/domain/toll-catalog-status.policy.js'
import { TOLL_CATALOG_STALE_AFTER_DAYS } from '../../src/toll-booths/domain/toll-catalog-status.constant.js'

const TODAY = new Date('2026-09-15T00:00:00.000Z')

describe('status do catálogo de praças', () => {
  test('catálogo sem praça nenhuma é `empty`, mesmo com data', () => {
    const result = resolveTollCatalogStatus({
      summary: { boothCount: 0, latestObservedOn: '2026-06-01' },
      today: TODAY,
    })

    expect(result).toEqual({ observedOn: null, status: 'empty' })
  })

  test('catálogo com praças mas sem data conhecida é `empty`', () => {
    const result = resolveTollCatalogStatus({
      summary: { boothCount: 5, latestObservedOn: null },
      today: TODAY,
    })

    expect(result).toEqual({ observedOn: null, status: 'empty' })
  })

  test('exatamente no limite de 365 dias ainda é `current`', () => {
    const observedOn = '2025-09-15'
    const result = resolveTollCatalogStatus({
      summary: { boothCount: 10, latestObservedOn: observedOn },
      today: TODAY,
    })

    expect(result).toEqual({ observedOn, status: 'current' })
  })

  test('um dia além do limite vira `stale`', () => {
    const observedOn = '2025-09-14'
    const result = resolveTollCatalogStatus({
      summary: { boothCount: 10, latestObservedOn: observedOn },
      today: TODAY,
    })

    expect(result).toEqual({ observedOn, status: 'stale' })
  })

  test('data recente é `current`', () => {
    const observedOn = '2026-09-01'
    const result = resolveTollCatalogStatus({
      summary: { boothCount: 166, latestObservedOn: observedOn },
      today: TODAY,
    })

    expect(result).toEqual({ observedOn, status: 'current' })
  })

  test('o teto de dias é configurável, para o contrato não depender do padrão de produção', () => {
    const observedOn = '2026-09-01'
    const result = resolveTollCatalogStatus({
      staleAfterDays: 10,
      summary: { boothCount: 1, latestObservedOn: observedOn },
      today: TODAY,
    })

    expect(result.status).toBe('stale')
  })

  test('o padrão é 365 dias — reajuste de pedágio é anual', () => {
    expect(TOLL_CATALOG_STALE_AFTER_DAYS).toBe(365)
  })
})
