/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  MAP_VIEWBOX_SIZE,
  resolveTripRouteMap,
} from '../../src/modules/trip/shared/tripRouteMap.service'

function parada(sequence: number, latitude: null | string, longitude: null | string) {
  return { label: `Parada ${sequence}`, latitude, longitude, sequence }
}

const SAO_CARLOS = parada(1, '-22.0175', '-47.8908')
const ARARAQUARA = parada(2, '-21.7845', '-48.1758')

describe('mapa do roteiro (spec 079 T012)', () => {
  /**
   * ⚠️ **Parada sem coordenada é nomeada fora do mapa, nunca some.** É a mesma regra da cidade sem
   * polígono na aba Regiões: roteiro visto pela metade é pior que roteiro visto inteiro com um
   * aviso ao lado — quem olha não tem como saber que faltou alguém.
   */
  it('nomeia fora do mapa a parada sem coordenada', () => {
    const map = resolveTripRouteMap({
      stops: [SAO_CARLOS, ARARAQUARA, parada(3, null, null)],
    })

    expect(map?.points).toHaveLength(2)
    expect(map?.stopsWithoutLocation).toEqual(['Parada 3'])
  })

  /** Nenhuma parada localizada é ausência de mapa — não um mapa vazio que parece carregado. */
  it('sem coordenada nenhuma não há mapa', () => {
    const map = resolveTripRouteMap({ stops: [parada(1, null, null)] })

    expect(map).toBeNull()
  })

  /** A janela enquadra todas as paradas: uma fixa cortaria roteiro intermunicipal pela metade. */
  it('enquadra todas as paradas dentro da área desenhável', () => {
    const map = resolveTripRouteMap({ stops: [SAO_CARLOS, ARARAQUARA] })

    for (const point of map?.points ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(MAP_VIEWBOX_SIZE)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(MAP_VIEWBOX_SIZE)
    }
  })

  /** O norte fica em cima: no SVG o y cresce para baixo, e a latitude cresce para o norte. */
  it('põe o norte em cima', () => {
    const map = resolveTripRouteMap({ stops: [SAO_CARLOS, ARARAQUARA] })
    const [primeira, segunda] = map?.points ?? []

    // Araraquara (-21,78) é ao norte de São Carlos (-22,01), então tem y menor.
    expect(segunda?.y).toBeLessThan(primeira?.y ?? 0)
  })

  /**
   * ⚠️ Uma parada só — ou várias no mesmo ponto — não tem extensão para enquadrar, e dividir pela
   * amplitude zero daria `NaN` em toda coordenada. O ponto vai para o centro.
   */
  it('centraliza quando não há extensão para enquadrar', () => {
    const map = resolveTripRouteMap({ stops: [SAO_CARLOS] })
    const [ponto] = map?.points ?? []

    expect(ponto?.x).toBe(MAP_VIEWBOX_SIZE / 2)
    expect(ponto?.y).toBe(MAP_VIEWBOX_SIZE / 2)
  })

  /** A ordem do roteiro é o que o traço liga: embaralhar produziria um caminho que ninguém faz. */
  it('mantém a ordem das paradas', () => {
    const map = resolveTripRouteMap({ stops: [ARARAQUARA, SAO_CARLOS] })

    expect(map?.points.map((point) => point.sequence)).toEqual([2, 1])
  })
})
