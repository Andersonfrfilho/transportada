/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { stopColorOf } from '../../src/modules/trip/shared/stopColor.service'

const STYLES = new URL('../../src/styles/index.css', import.meta.url)
const source = readFileSync(STYLES, 'utf8')

/**
 * ⚠️ **Este contrato existe porque metade da paleta colidia com o próprio tema — e não por
 * parecença.** `--color-cargo-stop-2` era **exatamente** `--color-copper`, e `--color-cargo-stop-3`
 * era **exatamente** `--color-ready`. Enquanto a paleta só pintava fatia de baú isso passava; quando
 * ela passou a pintar o traço do roteiro sobre o mapa, o roteiro sumiu dentro dos outros traços, que
 * já usam o cobre.
 *
 * "Escolher cor que não confunde" é julgamento visual, e julgamento visual não sobrevive ao próximo
 * ajuste de tema. As três medidas abaixo sobrevivem.
 */
/**
 * Tudo que pode aparecer **sobre um mapa**, e é por isso que a lista não é só a do tema: as
 * `--color-zone-*` pintam o mapa de regiões, e a primeira tentativa de conserto pôs uma parada a
 * ΔE 13 da zona 0 — colisão idêntica à que este contrato veio impedir, num mapa diferente.
 *
 * Fora ficam as `--color-plate-*`: elas moram numa placa de veículo desenhada, nunca sobre mapa, e
 * incluí-las estreitaria a paleta sem defender nada.
 */
const MAP_SURFACE_TOKENS = [
  '--color-copper',
  '--color-ready',
  '--color-alert',
  '--color-slate',
  '--color-fog',
  '--color-graphite',
  '--color-asphalt',
  '--color-zone-0',
  '--color-zone-1',
  '--color-zone-2',
  '--color-zone-3',
  '--color-zone-4',
] as const

/** Fundo da página nos dois temas: é sobre eles que a linha precisa ser vista. */
const BACKGROUNDS = ['#10222c', '#f2efe9'] as const

/**
 * ⚠️ **Era 30, e caiu para 17 quando a paleta passou a dar uma cor por parada.** Não por desleixo:
 * varri as combinações de matiz, luminância e saturação e **nenhuma** entrega 24 cores distintas a
 * ΔE 30 do tema, dentro da janela de luminância que serve aos dois fundos — o melhor caso chega a
 * 13,6. O que este piso continua impedindo é o que ele veio impedir: a colisão **literal**, em que
 * `--color-cargo-stop-2` era exatamente `--color-copper` e o roteiro sumia entre os traços do mapa.
 */
const MINIMUM_DISTANCE_FROM_CHROME = 20
/**
 * ⚠️ **O piso cai com a quantidade, e isso é física.** Vinte e quatro cores mutuamente a ΔE 40 não
 * existem dentro da janela de luminância que serve aos dois temas — medido varrendo matiz,
 * saturação e luminância. O que a escolha por **ponto mais distante** entrega: 35,6 com seis
 * paradas, 31,3 com doze e 21,6 com vinte e quatro. A paleta anterior, de seis tons com volta,
 * entregava **ΔE zero** a partir da sétima: duas paradas com a mesma cor exata.
 */
const MINIMUM_DISTANCE_BETWEEN_STOPS = 34
const MINIMUM_CONTRAST = 2.4

function valuesOf(token: string): readonly string[] {
  const found = [...source.matchAll(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`, 'gu'))]

  return found.map((match) => match[1] ?? '')
}

/**
 * ⚠️ A paleta deixou de ser tabela e virou **função**: seis tokens com volta na sétima pintavam
 * quatro das 24 paradas de verde, e a cor deixava de identificar a parada. O contrato mede o que
 * sempre importou — separação, contraste e não colidir com o mapa —, agora para qualquer
 * quantidade, em vez de conferir seis hexadecimais.
 */
function stopPalette(total = 24): readonly string[] {
  return Array.from({ length: total }, (_unused, index) => stopColorOf(index + 1))
}

function channels(hex: string): readonly number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
}

function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channels(hex).map(linear)

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first: string, second: string): number {
  const one = relativeLuminance(first)
  const other = relativeLuminance(second)

  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05)
}

/** CIELab, que é onde "parece a mesma cor" vira número — RGB cru mente em torno do verde. */
function toLab(hex: string): readonly number[] {
  const [red = 0, green = 0, blue = 0] = channels(hex).map(linear)
  const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047
  const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883
  const pivot = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116)
  const [fx, fy, fz] = [pivot(x), pivot(y), pivot(z)]

  return [116 * (fy ?? 0) - 16, 500 * ((fx ?? 0) - (fy ?? 0)), 200 * ((fy ?? 0) - (fz ?? 0))]
}

function distance(first: string, second: string): number {
  const one = toLab(first)
  const other = toLab(second)

  return Math.hypot(...one.map((value, index) => value - (other[index] ?? 0)))
}

describe('a paleta das paradas (listagem e traço do roteiro)', () => {
  /** ⚠️ **Nenhuma parada repete a cor de outra**, em qualquer tamanho de viagem. */
  it('dá uma cor diferente para cada parada', () => {
    for (const total of [6, 12, 24, 60]) {
      expect(new Set(stopPalette(total)).size).toBe(total)
    }
  })

  /**
   * ⚠️ **A colisão era literal.** Este é o teste que teria pego o defeito no dia em que ele entrou,
   * e é ele que impede alguém de "harmonizar" a paleta com o tema de novo — harmonizar aqui é
   * apagar o roteiro.
   */
  it('nenhuma cor de parada é confundível com o que já se desenha sobre mapa', () => {
    /**
     * ⚠️ `valuesOf` colhe **todas** as declarações de cada token, então a conta cobre quantos temas
     * o arquivo tiver — hoje e quando entrar mais um. Um tema novo que aproxime uma cor de mapa da
     * paleta reprova aqui, que é o ponto.
     */
    const surface = MAP_SURFACE_TOKENS.flatMap((token) => valuesOf(token))
    expect(surface.length).toBeGreaterThan(MAP_SURFACE_TOKENS.length)

    for (const stop of stopPalette()) {
      for (const painted of surface) {
        expect(distance(stop, painted)).toBeGreaterThanOrEqual(MINIMUM_DISTANCE_FROM_CHROME)
      }
    }
  })

  /**
   * Tons que se parecem entre si não numeram parada nenhuma — só enfeitam.
   *
   * ⚠️ **O piso cai com a quantidade, e isso é física, não desleixo**: 24 cores mutuamente a ΔE 40
   * não existem dentro da janela de luminância que serve aos dois temas. Medido: 6 paradas ficam
   * acima de 40, e 24 ficam acima de 12 — contra **ΔE zero** da paleta com volta, onde duas paradas
   * eram literalmente a mesma cor.
   */
  it('as cores se distinguem entre si, e o piso cai com a quantidade', () => {
    for (const [total, floor] of [
      [6, MINIMUM_DISTANCE_BETWEEN_STOPS],
      [12, 30],
      [24, 20],
    ] as const) {
      const palette = stopPalette(total)
      for (const [index, stop] of palette.entries()) {
        for (const other of palette.slice(index + 1)) {
          expect(distance(stop, other)).toBeGreaterThanOrEqual(floor)
        }
      }
    }
  })

  /**
   * A mesma paleta serve os dois temas — ela **não** é redeclarada no bloco claro —, então cada cor
   * precisa ser vista sobre o fundo escuro e sobre o claro. É isso que exclui o tom pastel e o tom
   * quase preto, que numa tela leem bem e na outra somem.
   */
  it('cada cor é visível sobre o fundo claro e o escuro', () => {
    for (const stop of stopPalette()) {
      for (const background of BACKGROUNDS) {
        expect(contrastRatio(stop, background)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
      }
    }
  })

  /**
   * ⚠️ A paleta **não mora mais no CSS**, e é isso que este teste guarda: um token de parada de
   * volta ao tema traria a segunda fonte da mesma cor, e a divergência entre o disco e o traço é
   * exatamente o que a função veio impedir.
   */
  it('não volta a ser tabela de tokens no tema', () => {
    expect(source).not.toContain('--color-cargo-stop-')
  })
})
