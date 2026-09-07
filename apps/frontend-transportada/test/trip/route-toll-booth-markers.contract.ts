/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 093 T4: a praça de pedágio **do trajeto** desenhada no mapa da montagem, com o valor por
 * eixo ao lado do ícone. A camada `cabine-de-pedagio` do basemap (spec 089) continua mostrando
 * toda cabine da região, sem valor — esta é outra, alimentada pela resposta da rota (spec 090 D4)
 * e filtrada pela opção de rota escolhida (spec 093 T3).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { formatAmount } from '../../src/modules/shared/decimalAmount.service'
import {
  formatBoothCharge,
  resolveTollBoothMarkers,
} from '../../src/modules/trip/shared/assemblyToll.service'
import type { RouteGeometryToll } from '../../src/modules/trip/shared/routeGeometry.service'

const COMPONENT = new URL(
  '../../src/modules/trip/components/AssemblyVectorMap.component.tsx',
  import.meta.url,
)

function praca(input: {
  readonly chargePerAxle: null | string
  readonly latitude?: string
  readonly longitude?: string
  readonly osmNodeId?: number
}) {
  return {
    chargeCar: input.chargePerAxle,
    chargePerAxle: input.chargePerAxle,
    latitude: input.latitude ?? '-21.1775000',
    longitude: input.longitude ?? '-47.8103000',
    name: 'Praça',
    operator: 'Operadora',
    osmNodeId: input.osmNodeId ?? 1,
  }
}

function toll(booths: RouteGeometryToll['booths']): RouteGeometryToll {
  return {
    axles: { count: 2, source: 'declared' },
    booths,
    boothsWithoutCharge: booths.filter((booth) => booth.chargePerAxle === null).length,
    chargePerAxle: '0.0000',
    tariffObservedOn: null,
    total: '0.0000',
  }
}

describe('o valor da praça, formatado (spec 093 D3)', () => {
  it('imprime a tarifa por eixo quando conhecida', () => {
    expect(formatBoothCharge('12.30')).toBe(formatAmount('12.30'))
  })

  /**
   * ⚠️ Medido na 090: `0.00` é tarifa **declarada** em 4 das 166 praças — campo não mapeado, não
   * isenção. Só `null` é "não sei", e é isso que vira travessão.
   */
  it('nunca imprime "R$ 0,00" para tarifa desconhecida — vira travessão', () => {
    const rótulo = formatBoothCharge(null)

    expect(rótulo).toBe('—')
    expect(rótulo).not.toBe(formatAmount('0.00'))
  })

  it('tarifa declarada zerada continua imprimindo o valor, não o travessão', () => {
    expect(formatBoothCharge('0.00')).toBe(formatAmount('0.00'))
  })
})

describe('as praças do trajeto, com coordenada e rótulo (spec 093 T4)', () => {
  it('sem pedágio calculado, não há praça nenhuma para desenhar', () => {
    expect(resolveTollBoothMarkers(null)).toEqual([])
  })

  it('cada praça carrega a própria coordenada e o valor formatado ao lado', () => {
    const marcadores = resolveTollBoothMarkers(
      toll([
        praca({ chargePerAxle: '10.50', latitude: '-22.0175000', longitude: '-47.8908000' }),
        praca({
          chargePerAxle: null,
          latitude: '-22.0090000',
          longitude: '-47.8825000',
          osmNodeId: 2,
        }),
      ]),
    )

    expect(marcadores).toEqual([
      { label: formatAmount('10.50'), latitude: -22.0175, longitude: -47.8908 },
      { label: '—', latitude: -22.009, longitude: -47.8825 },
    ])
  })
})

describe('o desenho da praça do trajeto no mapa (spec 093 T4)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('constrói a fonte a partir das praças da opção de rota escolhida, não do basemap', () => {
    expect(source).toInclude('resolveTollBoothMarkers')
    expect(source).toInclude('geometry?.toll')
  })

  /**
   * ⚠️ A mesma garantia de `vector-basemap.contract.ts`: nenhum `addLayer` deste componente passa
   * `beforeId`, e é essa ausência — não a ordem de declaração — que garante toda camada de WebGL
   * abaixo do pino da parada (DOM, sempre por cima do canvas). Aquele contrato já cobre "nenhum
   * `addLayer` do componente usa `beforeId`" por texto de fonte; este só confere que a camada da
   * praça existe e que a chamada dela, isolada, também respeita a regra.
   */
  it('a camada nova também entra sem `beforeId`', () => {
    const inicio = source.indexOf("map.addLayer({\n        id: 'praca-do-trajeto'")
    expect(inicio).toBeGreaterThan(-1)
    const fim = source.indexOf('})', inicio) + '})'.length
    const chamada = source.slice(inicio, fim)

    expect(chamada).not.toContain('beforeId')
  })

  /** O glifo é texto do MapLibre (WebGL) — exceção já registrada a `web.md` §9. */
  it('desenha o valor como texto, ao lado do glifo da praça', () => {
    const inicio = source.indexOf("id: 'praca-do-trajeto'")
    expect(inicio).toBeGreaterThan(-1)
    const trecho = source.slice(inicio, inicio + 800)

    expect(trecho).toContain('text-field')
    expect(trecho).toContain("['get', 'label']")
  })
})
