/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveAssemblyMapBounds } from '../../src/modules/trip/shared/assemblyMapBounds.service.js'

const MAPA = 'src/modules/trip/components/AssemblyVectorMap.component.tsx'

function fonte(caminho: string): string {
  return readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8')
}

/** Três entregas em Ribeirão Preto; o barracão fica bem a leste delas. */
const ENTREGAS = [
  { latitude: -21.1775, longitude: -47.8103 },
  { latitude: -21.1801, longitude: -47.8055 },
  { latitude: -21.1749, longitude: -47.8129 },
] as const

const BARRACAO = { latitude: '-21.1690', longitude: '-47.6500' } as const

describe('enquadramento do mapa da montagem', () => {
  /**
   * ⚠️ **O defeito que este contrato existe para travar.** O quadro saía das paradas, e o barracão
   * — que é marcado no mapa e é de onde o caminhão parte — ficava fora da tela. Quem abria a
   * montagem via as entregas e concluía que a rota começava na primeira delas.
   */
  it('enquadra o barracão junto das entregas', () => {
    const bounds = resolveAssemblyMapBounds({
      depotOrigin: BARRACAO,
      routePoints: [],
      stops: ENTREGAS,
    })

    expect(bounds).not.toBeNull()
    expect(bounds?.east).toBeGreaterThanOrEqual(-47.65)
  })

  /**
   * ⚠️ O traçado é o que a tela desenha, e a estrada faz volta: ela sai do envelope das paradas
   * sempre que a rodovia contorna alguma coisa. Enquadrar só os pontos cortaria a linha no meio,
   * e o corte apareceria justamente no trecho que fez o operador olhar o mapa.
   */
  it('enquadra o traçado, não só os pontos que ele liga', () => {
    const bounds = resolveAssemblyMapBounds({
      depotOrigin: null,
      routePoints: [
        { latitude: '-21.1775', longitude: '-47.8103' },
        { latitude: '-21.4200', longitude: '-47.9500' },
        { latitude: '-21.1749', longitude: '-47.8129' },
      ],
      stops: ENTREGAS,
    })

    expect(bounds?.south).toBeLessThanOrEqual(-21.42)
    expect(bounds?.west).toBeLessThanOrEqual(-47.95)
  })

  /** Sem barracão e sem estrada sobra o que sempre houve: as paradas. */
  it('cai no enquadramento das paradas quando não há barracão nem traçado', () => {
    const bounds = resolveAssemblyMapBounds({ depotOrigin: null, routePoints: [], stops: ENTREGAS })

    expect(bounds).toEqual({
      east: -47.8055,
      north: -21.1749,
      south: -21.1801,
      west: -47.8129,
    })
  })

  /**
   * ⚠️ Ausência é `null`, **nunca** um quadro em zero: latitude 0 e longitude 0 é o golfo da Guiné,
   * e o mapa abriria no Atlântico anunciando que a viagem está lá.
   */
  it('devolve ausência quando não há nada para enquadrar', () => {
    expect(resolveAssemblyMapBounds({ depotOrigin: null, routePoints: [], stops: [] })).toBeNull()
  })

  /**
   * ⚠️ Coordenada que não vira número é descartada, não vira zero. Uma só arrastaria o quadro até o
   * golfo da Guiné e faria as entregas sumirem num ponto — o mapa some por causa de uma linha.
   */
  it('descarta coordenada ilegível em vez de arrastar o quadro', () => {
    const bounds = resolveAssemblyMapBounds({
      depotOrigin: { latitude: '', longitude: 'nao-e-numero' },
      routePoints: [],
      stops: ENTREGAS,
    })

    expect(bounds).toEqual({
      east: -47.8055,
      north: -21.1749,
      south: -21.1801,
      west: -47.8129,
    })
  })

  /**
   * ⚠️ O que ficou **fora da seleção** não entra no quadro. São centenas de notas espalhadas pelo
   * estado, e enquadrá-las afastaria a câmera até as paradas da viagem virarem um borrão — elas são
   * contexto de fundo, não destino desta viagem.
   */
  it('não enquadra as notas fora da seleção', () => {
    const source = fonte(MAPA)
    const inicio = source.indexOf('resolveAssemblyMapBounds({')
    expect(inicio).toBeGreaterThan(-1)

    expect(source.slice(inicio, source.indexOf('})', inicio))).not.toContain('nearby')
  })

  /** O botão de recentrar e a montagem usam a mesma conta — dois enquadramentos divergiriam. */
  it('recentrar devolve o mesmo quadro da montagem', () => {
    const source = fonte(MAPA)

    expect(source.match(/fitToTrip\(/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
