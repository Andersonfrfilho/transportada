/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildCargoPrintSummary } from '@/modules/trip/shared/cargoPrintSummary.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function box(overrides: Partial<Parameters<typeof buildCargoPrintSummary>[0][number]>) {
  return {
    depthM: 0.5,
    isEstimated: false,
    isSplit: false,
    stopSequence: 1,
    /** A largura e o `y` só são lidos em faixas; esta suíte é toda de profundidade. */
    widthM: 0.4,
    xM: 0,
    yM: 0,
    ...overrides,
  }
}

/** Spec 095 G008: a folha que o agregado leva para dentro da van. */
describe('trip cargo print contract', () => {
  /**
   * ⚠️ A folha sai na **ordem de carregamento**, que é o inverso da de entrega: quem empilha começa
   * pela última parada, encostando na testeira. Na ordem de entrega, a folha se lê de baixo para
   * cima.
   */
  it('prints in loading order, not delivery order', () => {
    const rows = buildCargoPrintSummary([
      box({ stopSequence: 1, xM: 4 }),
      box({ stopSequence: 3, xM: 0 }),
      box({ stopSequence: 2, xM: 2 }),
    ])

    expect(rows.map((row) => row.stopSequence)).toEqual([3, 2, 1])
  })

  /** Cada parada leva a faixa que ocupa, em metros do fundo — é o que se confere com a fita. */
  it('gives each stop its span in metres', () => {
    const rows = buildCargoPrintSummary([
      box({ stopSequence: 1, xM: 2 }),
      box({ depthM: 1, stopSequence: 1, xM: 3 }),
    ])

    expect(rows[0]).toMatchObject({ boxes: 2, fromM: 2, toM: 4 })
  })

  /**
   * ⚠️ A faixa em metros **não conta a sobra**: ela mora fora da fatia, mais funda, e a folha
   * imprimiria um começo dentro da parada seguinte — apontando o lugar errado na única informação
   * que ela promete carregar.
   */
  it('leaves split cargo out of the printed span', () => {
    const rows = buildCargoPrintSummary([
      box({ isSplit: true, stopSequence: 1, xM: 0.5 }),
      box({ stopSequence: 1, xM: 3 }),
    ])

    expect(rows[0]).toMatchObject({ boxes: 2, fromM: 3, split: 1, toM: 3.5 })
  })

  /** As duas contagens que mudam o que a pessoa faz: o que é palpite e o que está fora do lugar. */
  it('counts presumed and split cargo apart', () => {
    const rows = buildCargoPrintSummary([
      box({ isEstimated: true }),
      box({ isSplit: true }),
      box({}),
    ])

    expect(rows[0]).toMatchObject({ boxes: 3, presumed: 1, split: 1 })
  })

  /**
   * ⚠️ **Nada na folha pode depender de cor**: o galpão imprime em laser mono. E os controles não
   * vão para o papel — botão impresso é tinta gasta.
   */
  it('prints black on white, without the controls', () => {
    const css = readFileSync(
      new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT),
      'utf8',
    )

    expect(css).toContain('@media print')
    expect(css).toContain('.cargoPads')
    expect(trip.cargoLayers.print).toBeDefined()
  })

  /**
   * ⚠️ **O botão imprime o mapa, não a tela.** `window.print()` manda a página inteira — cabeçalho,
   * menu, abas, mapa de rota e lista de notas —, e o mapa saía como um pedaço da terceira folha.
   */
  it('prints the marked region, not the whole screen', () => {
    const component = readFileSync(
      new URL('src/modules/trip/components/TripCargoLayers.component.tsx', APPLICATION_ROOT),
      'utf8',
    )
    const global = readFileSync(new URL('src/styles/index.css', APPLICATION_ROOT), 'utf8')

    expect(component).toContain('data-print-region')
    expect(global).toContain('[data-print-region]')
    /**
     * ⚠️ Por **visibilidade**, nunca por `display`: `display: none` num ancestral zera a caixa do
     * `<svg>` de dentro, e o desenho sairia em branco no papel.
     */
    expect(global).toContain('visibility: hidden')
  })

  /**
   * ⚠️ **Parada com TODAS as caixas divididas imprimia `Infinity m a 0.00 m`.** A faixa em metros
   * ignora a caixa dividida de propósito — ela viaja no topo, fora da fatia —, e sem nenhuma
   * inteira o acumulador ficava no infinito com que nasce. Medido na tela em 2026-09-10: parada 9
   * de 9, 23 caixas, as 23 divididas.
   */
  it('falls back to the split boxes when no whole box has a place', () => {
    const rows = buildCargoPrintSummary([
      box({ isSplit: true, stopSequence: 9, xM: 2 }),
      box({ isSplit: true, stopSequence: 9, xM: 3 }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.fromM).toBe(2)
    expect(rows[0]?.toM).toBe(3.5)
    expect(Number.isFinite(rows[0]?.fromM ?? Number.POSITIVE_INFINITY)).toBe(true)
  })

  /** A inteira continua mandando: a dividida é o que resta, nunca o que vence. */
  it('keeps the whole box range when there is one', () => {
    const rows = buildCargoPrintSummary([
      box({ stopSequence: 4, xM: 1 }),
      box({ isSplit: true, stopSequence: 4, xM: 6 }),
    ])

    expect(rows[0]?.fromM).toBe(1)
    expect(rows[0]?.toM).toBe(1.5)
  })

  /**
   * Spec 120: a caixa do complemento mora fora da própria fatia, pela mesma razão que a dividida —
   * ela também não é o que se confere com a fita naquela faixa.
   */
  it('leaves complement cargo out of the printed span, counted in its own column', () => {
    const rows = buildCargoPrintSummary([
      { ...box({ stopSequence: 1, xM: 0.5 }), complement: 'outOfReach' as const },
      box({ stopSequence: 1, xM: 3 }),
    ])

    expect(rows[0]).toMatchObject({ boxes: 2, complement: 1, fromM: 3, toM: 3.5 })
  })

  /** `needsRehandling` também exclui a caixa da faixa — os dois motivos moram no complemento. */
  it('excludes needsRehandling from the span just like outOfReach', () => {
    const rows = buildCargoPrintSummary([
      { ...box({ stopSequence: 1, xM: 0.5 }), complement: 'needsRehandling' as const },
      box({ stopSequence: 1, xM: 3 }),
    ])

    expect(rows[0]).toMatchObject({ complement: 1, fromM: 3, toM: 3.5 })
  })

  /**
   * ⚠️ **Parada só com caixa do complemento imprimia `Infinity m a 0.00 m`** — mesmo defeito que a
   * parada toda dividida, e a mesma correção: sem nenhuma caixa dentro da própria fatia, a excluída
   * é o que resta.
   */
  it('falls back to the complement boxes when no box has a place inside its own slice', () => {
    const rows = buildCargoPrintSummary([
      { ...box({ stopSequence: 9, xM: 2 }), complement: 'outOfReach' as const },
      { ...box({ stopSequence: 9, xM: 3 }), complement: 'needsRehandling' as const },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.fromM).toBe(2)
    expect(rows[0]?.toM).toBe(3.5)
    expect(Number.isFinite(rows[0]?.fromM ?? Number.POSITIVE_INFINITY)).toBe(true)
  })

  /** Nenhuma caixa do complemento é o caso normal: a coluna nova sai zerada, não ausente. */
  it('counts zero complement when nothing came from it', () => {
    const rows = buildCargoPrintSummary([box({}), box({ isSplit: true, xM: 2 })])

    expect(rows[0]).toMatchObject({ complement: 0 })
  })

  /**
   * ⚠️ **São dois números, e eles não coincidem.** Quem carrega segue a ordem de carregamento; quem
   * dirige segue a de entrega. A folha imprimia só a primeira, e ligar a caixa à parada exigia
   * casar as duas listas por nome de mercado.
   */
  it('prints the delivery number beside the loading order', () => {
    const component = readFileSync(
      new URL('src/modules/trip/components/TripCargoLayers.component.tsx', APPLICATION_ROOT),
      'utf8',
    )

    expect(component).toContain("t('cargoLayers.print.delivery')")
    expect(component).toContain('{row.stopSequence}')
    expect(trip.cargoLayers.print.delivery).toBeTruthy()
    /** E a legenda de cor carrega o mesmo número, senão as duas listas seguem sem elo visível. */
    expect(component).toContain('styles.cargoStopOrder')
  })

  /** E o desenho vai junto: é ele o "mapa" que o botão promete. */
  it('keeps the drawing on paper', () => {
    const css = readFileSync(
      new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT),
      'utf8',
    )
    const printBlock = css.slice(css.lastIndexOf('@media print'))

    expect(printBlock).not.toContain('.cargoStage {\n    display: none')
    expect(printBlock).toContain('print-color-adjust: exact')
  })
})
