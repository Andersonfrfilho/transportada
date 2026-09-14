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
 * espaço, e o outro desenhava a distribuição sem o número que ela ilustra.
 *
 * ⚠️ E depois foram **três desenhos**: a fileira proporcional da 085, a planta em escala da 088 e o
 * isométrico da 095. A spec 095 ficou com um só — a fileira e a planta eram justamente as duas que
 * não dizem onde a caixa vai, e três linguagens para o mesmo fato é o que faz ninguém olhar
 * nenhuma.
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
    expect(source).toInclude('<TripCargoLayers')
  })

  /** Um desenho só: a fileira proporcional e a planta em escala saíram com a 095. */
  it('desenha a carga uma vez', () => {
    expect(source).not.toInclude('<TripCargoPlan')
    expect(source).not.toInclude('<TripCargoDrawing')
  })

  /**
   * ⚠️ O desenho segue a **ordem de carregamento**, não a de entrega: quem entrega por último viaja
   * no fundo, colado à cabine. Desenhar na ordem da rota poria a primeira parada no fundo — o
   * inverso do que o operador tem de fazer com o caminhão vazio na frente dele.
   */
  it('desenha na ordem de carregamento, não na de entrega', () => {
    /**
     * ⚠️ Spec 100: o cabeçalho passou a ter um por arranjo. Em profundidade ele continua dizendo
     * "da testeira", que é o que esta afirmação mede; em faixas nenhuma parada fica atrás de outra
     * e a palavra deixaria de ser verdade.
     */
    expect(trip.cargoLayers.print.caption.depth).toInclude('testeira')
    expect(trip.cargoLayers.print.caption.depth).toInclude('porta')
    /** E em faixas o cabeçalho diz o que muda: todas na porta, nenhuma atrás de outra. */
    expect(trip.cargoLayers.print.caption.lanes).toInclude('porta')
  })

  /**
   * ⚠️ **Representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume, e
   * a fatia é o total da parada — não a caixa. O desenho não pode ganhar altura por peça, pilha nem
   * canto: a spec 079 T003 já decidiu isso, e continuar valendo é o ponto deste teste.
   */
  /** `<svg>` cru é proibido fora do design system — o desenho vem de `@/components/ui`. */
  it('desenha sem svg cru', () => {
    expect(source).not.toInclude('<svg')
    expect(css).not.toInclude('.truckCab')
  })
})
