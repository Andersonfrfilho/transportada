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
const TOKENS = new URL('../../src/styles/index.css', import.meta.url)

/**
 * Spec 076. ⚠️ O painel é **representação proporcional, não plano de estiva**: a NF-e não traz
 * dimensão de volume, então não existe como dizer onde cada caixa vai. A diferença entre "esta
 * fatia do baú é da parada 3" e "esta caixa vai neste canto" é a diferença entre ajudar e enganar.
 */
describe('o baú na tela (spec 076)', () => {
  const source = readFileSync(PANEL, 'utf8')

  /** D3: escala honesta ou nada. Retângulo genérico "só para ilustrar" seria afirmação falsa. */
  it('não desenha sem capacidade conhecida', () => {
    expect(source).toInclude('if (layout === null) return null')
  })

  /**
   * RF4: a marca de estimativa acompanha o desenho com a mesma força do número — e **uma vez só**.
   * Enquanto ocupação e desenho eram dois painéis, cada um imprimia a sua, e o operador lia a mesma
   * ressalva duas vezes na mesma tela. Agora ela sai do bloco da ocupação, acima do desenho, e o
   * desenho não a repete.
   */
  it('carrega a marca de estimativa, sem repeti-la', () => {
    expect(source).toInclude("occupancy.source === 'estimated'")
    expect(source.match(/t\('occupancy\.estimated'\)/gu)).toHaveLength(1)
    expect(trip.cargoLayout.estimated).toInclude('estimad')
  })

  /**
   * ⚠️ O que a feature existe para dizer: **quem entrega por último viaja no fundo**. A tela precisa
   * dizer isso por escrito, não só pela posição — posição sem legenda é adivinhação.
   */
  it('explica que a ordem de carregamento é o inverso da entrega', () => {
    expect(trip.cargoLayout.loadOrderHint).toInclude('última')
    expect(trip.cargoLayout.loadOrderHint).toInclude('fundo')
  })

  /** RF5: excedente **fora** do baú — comprimir faria o desenho afirmar que a carga cabe. */
  it('mostra o excedente fora do baú, com o valor', () => {
    expect(source).toInclude('layout.overflowM3')
    expect(trip.cargoLayout.overflow).toInclude('{{volume}}')
  })

  /** RF7: parada sem cubagem é nomeada, nunca desenhada como fatia zero, que é invisível. */
  it('nomeia as paradas sem cubagem em vez de escondê-las', () => {
    expect(source).toInclude('layout.stopsWithoutVolume')
  })

  /** RF6: cor por parada vem dos tokens. Cor literal no módulo é rejeitada em code review. */
  it('usa a paleta de tokens, nunca cor literal', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u)
    /**
     * ⚠️ O token deixou de aparecer aqui quando a paleta virou `stopColor.service` — o traço do
     * roteiro passou a precisar dela, e três cópias da mesma aritmética é como a divergência começa.
     * O que este contrato guarda continua sendo o mesmo: nenhuma cor literal, e a paleta compartilhada.
     */
    expect(source).toInclude('stopColorOf')
    expect(readFileSync(TOKENS, 'utf8')).toInclude('--color-cargo-stop-1')
  })

  /** RNF1: o desenho é do design system — `<svg>` cru no módulo é proibido, com contrato próprio. */
  it('não desenha svg dentro do módulo', () => {
    expect(source).not.toInclude('<svg')
  })

  /** RNF2: a mesma informação em lista, para leitor de tela e para quem imprime. */
  it('tem descrição textual equivalente', () => {
    expect(source).toInclude('role="list"')
    expect(source).toInclude('aria-hidden')
  })

  /** RNF4: animação respeita quem pediu para não ter. */
  it('respeita prefers-reduced-motion', () => {
    const css = readFileSync(
      new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
      'utf8',
    )

    expect(css).toInclude('prefers-reduced-motion')
  })

  /** O painel tem de estar montado, senão os contratos acima protegem código morto. */
  it('está montado no detalhe da viagem', () => {
    expect(readFileSync(DETAIL, 'utf8')).toInclude('<TripCargoPanel')
  })
})
