/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { sortDriversByScore } from '@/modules/fleet/shared/driverRecommendation.service'
import type { FleetDriverListItem } from '@/modules/fleet/shared/fleet.types'

import fleetLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import { DRIVER_DETAIL } from './fleet.fixture'

function readSource(path: string): string {
  return readFileSync(new URL(`../../src/modules/${path}`, import.meta.url), 'utf8')
}

function buildDriver(overrides: Partial<FleetDriverListItem>): FleetDriverListItem {
  return { ...DRIVER_DETAIL, score: null, ...overrides }
}

describe('a ordenação da nota no seletor de motoristas (RF11, aceite 7)', () => {
  it('ordena da maior nota para a menor', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Ana', score: 60 }),
      buildDriver({ id: 'b', name: 'Bruno', score: 90 }),
      buildDriver({ id: 'c', name: 'Carlos', score: 75 }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'c', 'a'])
  })

  it('sem histórico (null) sempre por último, independente da posição de entrada', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Ana', score: null }),
      buildDriver({ id: 'b', name: 'Bruno', score: 40 }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'a'])
  })

  it('empate na nota desempata pelo nome', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Zeca', score: 80 }),
      buildDriver({ id: 'b', name: 'Ana', score: 80 }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'a'])
  })

  it('vários sem histórico desempatam entre si pelo nome', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Zeca', score: null }),
      buildDriver({ id: 'b', name: 'Ana', score: null }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'a'])
  })

  it('não muta a lista de entrada — devolve uma nova', () => {
    const drivers = [buildDriver({ id: 'a', name: 'Ana', score: 10 })]
    const sorted = sortDriversByScore(drivers)

    expect(sorted).not.toBe(drivers)
  })
})

/**
 * Spec 159 (T12, revisão de design): "95/100" solto no seletor não diz que é nota, e o leitor de tela
 * lia "barra". A opção diz "Nota 95 de 100"; o selo, ao lado do cabeçalho "Nota", só "95 de 100".
 */
describe('o texto da nota no seletor e no selo (T12)', () => {
  it('a opção do seletor nomeia a nota, nos dois seletores da viagem', () => {
    expect(fleetLocale.driverScore.option).toBe('Nota {{score}} de 100')
    expect(fleetLocale.driverScore.optionNone).toBe('Sem nota ainda')
    for (const path of [
      'trip/components/TripQuickCreateDialog.component.tsx',
      'trip/components/TripRouteAssemblyPanel.component.tsx',
    ]) {
      expect(readSource(path)).toInclude("tFleet('driverScore.option', { score: driver.score })")
    }
  })

  it('a ficha lista as penalidades com pontos e prazo à vista, sem tabela de cinco colunas', () => {
    const section = readSource('fleet/components/DriverScoreSection.component.tsx')
    expect(section).toInclude('<ul className={styles.penaltyList}>')
    expect(section).not.toInclude('<table')
    expect(fleetLocale.penaltyPoints).toBe('−{{points}} pontos')
  })
})
