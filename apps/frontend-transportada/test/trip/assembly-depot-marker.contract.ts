/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const MAPA = 'src/modules/trip/components/AssemblyVectorMap.component.tsx'
const ESTILO = 'src/modules/trip/styles/trip.module.css'

function fonte(caminho: string): string {
  return readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8')
}

describe('marcador do barracão (spec 097 D4)', () => {
  /**
   * ⚠️ O ponto de partida não é parada: não tem número na sequência e não recebe carga. Desenhado
   * com o mesmo pino, faz o operador contar quatro entregas onde há três, ou procurar a nota da
   * "parada 1" que é o próprio galpão.
   */
  it('desenha o barracão com elemento próprio, não com o pino de parada', () => {
    const source = fonte(MAPA)

    expect(source).toContain('depotElement')
    /** ⚠️ O recorte para na função seguinte: sem isso ele engole `stopElement`, que tem número. */
    const inicio = source.indexOf('function depotElement')
    const trecho = source.slice(inicio, source.indexOf('\nfunction ', inicio + 1))
    expect(trecho).not.toContain('sequence')
  })

  /**
   * ⚠️ **Forma, não só cor.** Cor sozinha não sobrevive a daltonismo nem a mapa impresso, e aqui a
   * diferença é categórica — origem contra destino —, não de grau. O contrato cobra uma classe
   * própria no CSS, que é onde a forma mora.
   */
  it('diferencia por forma, com classe própria no estilo', () => {
    expect(fonte(MAPA)).toContain('tileDepot')
    expect(fonte(ESTILO)).toContain('.tileDepot')
  })

  /**
   * ⚠️ Com `end_policy = 'depot'` o barracão é o primeiro **e** o último ponto do traçado, e é o
   * mesmo lugar. Dois marcadores idênticos sobrepostos sugeririam dois pontos distintos; a volta já
   * está dita pela linha.
   */
  it('marca o barracão uma vez só, mesmo quando a rota volta para ele', () => {
    const source = fonte(MAPA)
    const trecho = source.slice(source.indexOf('depotElement('))

    expect(trecho.slice(0, 400)).not.toContain('for (')
  })
})
