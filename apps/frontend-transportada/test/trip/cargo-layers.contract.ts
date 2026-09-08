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
   * Uma camada por vez: todas de uma vez seriam seis plantas empilhadas no celular de quem está no
   * galpão — e o carregamento é feito uma camada por vez, que é a razão de o desenho ser assim.
   */
  it('mostra uma camada por vez, com navegação', () => {
    expect(source).toContain("t('cargoLayers.position'")
    expect(source).toContain('setIndex')
    expect(trip.cargoLayers.position).toContain('{{total}}')
  })

  /**
   * ⚠️ O corte lateral é a segunda metade do par que substitui o 3D: a planta diz **onde** a caixa
   * fica, o corte diz **quão alto** a pilha sobe. As duas se conferem com fita; um isométrico não.
   */
  it('desenha o corte lateral ao lado da planta', () => {
    expect(source).toContain('TripCargoSideView')
    expect(source).toContain('styles.cargoSideView')
  })

  /** A caixa presumida sai hachurada — a diferença entre medido e derivado do volume. */
  it('distingue a caixa presumida da medida', () => {
    const plan = readApplicationFile('src/components/ui/scale-plan.tsx')

    expect(source).toContain("isEstimated: box.source === 'estimated'")
    expect(plan).toContain("cargoBox.isEstimated ? 'url(#scale-plan-hatch)' : cargoBox.color")
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
