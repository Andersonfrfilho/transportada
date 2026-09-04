/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const PANEL = new URL(
  '../../src/modules/trip/components/TripCargoPanel.component.tsx',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const CSS = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

/**
 * A carga era **dois painéis**: um dizia quanto do baú foi ocupado sem mostrar de quem era o
 * espaço, e o outro desenhava a distribuição sem o número que ela ilustra. A ressalva de estimativa
 * aparecia nos dois.
 */
describe('a carga da viagem num painel só (spec 080 T011/T012)', () => {
  const source = readFileSync(PANEL, 'utf8')
  const detail = readFileSync(DETAIL, 'utf8')
  const css = readFileSync(CSS, 'utf8')

  it('a tela monta um painel, não dois', () => {
    expect(detail).toInclude('<TripCargoPanel')
    expect(detail).not.toInclude('<TripOccupancyPanel')
    expect(detail).not.toInclude('<TripCargoLayoutPanel')
  })

  it('o painel reúne ocupação, peso e desenho', () => {
    expect(source).toInclude("t('occupancy.ratio'")
    expect(source).toInclude("t('cargoWeight.total'")
    expect(source).toInclude('layout.slices')
  })

  /**
   * ⚠️ O desenho segue a **ordem de carregamento**, não a de entrega: quem entrega por último viaja
   * no fundo, colado à cabine. Desenhar na ordem da rota poria a primeira parada no fundo — o
   * inverso do que o operador tem de fazer com o caminhão vazio na frente dele.
   */
  it('desenha na ordem de carregamento, não na de entrega', () => {
    expect(source).toInclude('sort((first, second) => first.loadOrder - second.loadOrder)')
    expect(trip.cargoLayout.bottom).toInclude('última')
    expect(trip.cargoLayout.door).toInclude('primeira')
  })

  /** As duas pontas são nomeadas: posição sem legenda é adivinhação. */
  it('nomeia o fundo e a porta', () => {
    expect(source).toInclude("t('cargoLayout.bottom')")
    expect(source).toInclude("t('cargoLayout.door')")
  })

  /**
   * ⚠️ **Representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume, e
   * a fatia é o total da parada — não a caixa. O desenho não pode ganhar altura por peça, pilha nem
   * canto: a spec 079 T003 já decidiu isso, e continuar valendo é o ponto deste teste.
   */
  it('não sugere posição de peça', () => {
    expect(source).toInclude('não sugere posição de peça')
    expect(source).not.toInclude('stow')
  })

  /** O desenho é caixa de CSS: `<svg>` cru é proibido fora do design system. */
  it('desenha sem svg', () => {
    expect(source).not.toInclude('<svg')
    expect(css).toInclude('.truckCab')
  })
})
