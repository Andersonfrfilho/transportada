/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

describe('planta das camadas (spec 094)', () => {
  const source = readApplicationFile('src/modules/trip/components/TripCargoLayers.component.tsx')

  /**
   * ⚠️ A linha que diz o que a planta **não** promete é fixa, nunca condicional: um desenho de
   * posição sem essa ressalva é lido como instrução de carregamento, e a tela não conhece
   * empilhabilidade de toda caixa, peso por caixa nem limite por eixo.
   */
  it('diz o que não promete, sempre', () => {
    expect(source).toContain("t('cargoLayers.promise')")
    /** Sem condição em volta: procurar o ternário mais próximo é o que pegaria a regressão. */
    expect(source).not.toContain("? t('cargoLayers.promise')")
    expect(trip.cargoLayers.promise).toContain('não é plano de estiva')
    expect(trip.cargoLayers.promise).toContain('eixo')
  })

  /**
   * ⚠️ **Todas as camadas listadas, com o que cada uma tem dentro.** O par anterior/próxima dizia
   * "Camada 1 de 2" e obrigava a percorrer o baú para saber o que havia na de cima; numa pilha de
   * duas ou seis, a lista inteira cabe e responde de relance.
   */
  it('lista todas as camadas com o conteúdo de cada uma', () => {
    expect(source).toContain('placement.layers.map')
    expect(source).toContain("t('cargoLayers.layerSummary'")
    expect(trip.cargoLayers.layerSummary).toContain('{{boxes}}')
    expect(trip.cargoLayers.layerSummary).toContain('{{stops}}')
  })

  /**
   * ⚠️ **A pilha inteira aparece, com a camada aberta em foco.** Desenhar só a camada escolhida
   * tiraria o que a perspectiva tem de melhor — ver como a carga sobe — e deixaria as caixas
   * flutuando sobre um piso vazio.
   */
  it('mostra todas as camadas, destacando a aberta', () => {
    expect(source).toContain('placement.layers.flatMap')
    /**
     * ⚠️ O foco é pelo **índice** da camada, nunca pela altura: com fatias de caixas de alturas
     * diferentes, duas camadas de índice igual estão em alturas diferentes, e comparar altura
     * acenderia meia camada.
     */
    expect(source).toContain('focusLayer: current.index')
  })

  /**
   * ⚠️ As aberturas são ditas em **texto**, fora do desenho: rótulo dentro do quadro sai cortado e
   * atravessa a borda — foi o que aconteceu com "Porta lateral (direita)" na planta anterior.
   */
  it('nomeia as portas em texto, fora do desenho', () => {
    expect(source).toContain("t('cargoLayers.doorsRearAndSide')")
    expect(trip.cargoLayers.doorsRearAndSide).toContain('lateral direita')
  })

  /**
   * A caixa presumida sai na **mesma cor, lavada** — a diferença entre medido e derivado do volume.
   *
   * ⚠️ Nunca hachura: o risco diagonal cruza as arestas e lê como rachadura na quina, e o padrão SVG
   * tem fundo transparente, o que deixava a caixa presumida vazada — 60% da carga sem cor nenhuma.
   */
  it('distingue a caixa presumida da medida', () => {
    const isometric = readApplicationFile('src/components/ui/cargo-isometric.tsx')

    expect(source).toContain("isEstimated: box.source === 'estimated'")
    /** Spec 119: a presumida é o contorno pontilhado — a lavagem clareava o tom da nota. */
    expect(isometric).toContain('styles.facePresumed')
    expect(isometric).not.toContain('faceWash')
  })

  /** O que não coube é nomeado, nunca escondido — e cada motivo tem texto próprio. */
  it('nomeia o que ficou de fora, por motivo', () => {
    expect(source).toContain('placement.unplaced.map')
    for (const reason of ['notMeasured', 'largerThanBed', 'bedFull', 'tooMany']) {
      expect(trip.cargoLayers.unplaced).toHaveProperty(reason)
    }
  })

  /** Sem baú medido não há planta de posição — a regra da 088 D2 vale aqui inteira. */
  it('não desenha sem as medidas do baú', () => {
    expect(source).toContain('layout.bedLengthM === null || layout.bedWidthM === null')
  })

  /** O painel monta o componente, senão o contrato acima protege código morto. */
  it('está montado no painel de carga', () => {
    expect(
      readApplicationFile('src/modules/trip/components/TripCargoPanel.component.tsx'),
    ).toContain('<TripCargoLayers')
  })
})
