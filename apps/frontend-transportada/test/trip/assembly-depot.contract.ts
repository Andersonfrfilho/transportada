/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097: a montagem conta a perna do barracão, e diz quando ela ficou de fora.
 *
 * ⚠️ Três coisas que este contrato guarda e que não se deduzem do código:
 *
 * 1. `buildAssemblyLegs` **descarta tudo** quando a contagem de trechos não bate com a das paradas
 *    — era assim que ela evitava pendurar o tempo de um caminho ao pé de outro. Com a perna do
 *    barracão a contagem passou a bater com `paradas + leading + trailing`, e sem o corte a tela
 *    perderia **todos** os tempos por parada de uma vez, calada.
 * 2. A lista numerada continua sendo só das entregas (D3) — o barracão é origem, não destino.
 * 3. Ausência de coordenada é **declarada** (D2). Queda silenciosa é o defeito que a spec mata.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildAssemblyDepotLegs,
  buildAssemblyLegs,
  totalAssemblyMinutes,
} from '../../src/modules/trip/shared/assemblyLeg.service'
import type { AssemblyMapPoint } from '../../src/modules/trip/shared/assemblyMap.service'
import type { RouteGeometry } from '../../src/modules/trip/shared/routeGeometry.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)

function parada(cityCode: string, sequence: number): AssemblyMapPoint {
  return {
    cityCode,
    label: cityCode,
    latitude: -21,
    longitude: -47,
    sequence,
    stopKey: cityCode,
  } as AssemblyMapPoint
}

const PARADAS = [parada('3534302', 1), parada('3521002', 2)]

const TRECHO_BARRACAO = { distanceMetres: 57_000, durationSeconds: 3_000 }
const TRECHO_ENTREGAS = { distanceMetres: 48_300, durationSeconds: 2_400 }
const TRECHO_RETORNO = { distanceMetres: 103_700, durationSeconds: 4_800 }

function geometria(input: {
  readonly depot?: RouteGeometry['depot']
  readonly legs: readonly { distanceMetres: number; durationSeconds: number }[]
}): RouteGeometry {
  return {
    legs: input.legs,
    points: [],
    source: 'road',
    toll: null,
    ...(input.depot === undefined ? {} : { depot: input.depot }),
  }
}

describe('a perna do barracão na montagem (spec 097)', () => {
  it('mantém um trecho por par de paradas quando o barracão abre a rota', () => {
    const legs = buildAssemblyLegs({
      geometry: geometria({
        depot: { absence: null, leadingLegs: 1, origin: null, trailingLegs: 0 },
        legs: [TRECHO_BARRACAO, TRECHO_ENTREGAS],
      }),
      points: PARADAS,
    })

    expect(legs.length).toBe(PARADAS.length - 1)
    expect(legs[0]?.distanceKilometres).toBe(48.3)
  })

  it('também casa quando a rota volta ao barracão no fim', () => {
    const legs = buildAssemblyLegs({
      geometry: geometria({
        depot: { absence: null, leadingLegs: 1, origin: null, trailingLegs: 1 },
        legs: [TRECHO_BARRACAO, TRECHO_ENTREGAS, TRECHO_RETORNO],
      }),
      points: PARADAS,
    })

    expect(legs.length).toBe(1)
    expect(legs[0]?.distanceKilometres).toBe(48.3)
  })

  /** Sem barracão nada muda: a contagem de sempre continua sendo a que casa. */
  it('sem barracão a contagem de sempre continua valendo', () => {
    expect(
      buildAssemblyLegs({ geometry: geometria({ legs: [TRECHO_ENTREGAS] }), points: PARADAS })
        .length,
    ).toBe(1)
  })

  /** ⚠️ Contagem que não bate continua sendo descarte — o guard de sempre não afrouxou. */
  it('contagem que não bate continua sendo descarte', () => {
    expect(
      buildAssemblyLegs({
        geometry: geometria({
          depot: { absence: null, leadingLegs: 1, origin: null, trailingLegs: 0 },
          legs: [TRECHO_ENTREGAS],
        }),
        points: PARADAS,
      }),
    ).toEqual([])
  })

  it('separa os trechos do barracão dos trechos entre entregas', () => {
    const depotLegs = buildAssemblyDepotLegs({
      geometry: geometria({
        depot: { absence: null, leadingLegs: 1, origin: null, trailingLegs: 1 },
        legs: [TRECHO_BARRACAO, TRECHO_ENTREGAS, TRECHO_RETORNO],
      }),
      points: PARADAS,
    })

    expect(depotLegs.map((leg) => leg.kind)).toEqual(['outbound', 'return'])
    expect(depotLegs[0]?.distanceKilometres).toBe(57)
    expect(depotLegs[1]?.distanceKilometres).toBe(103.7)
  })

  /**
   * ⚠️ O total é da rota inteira — era ele que dizia 40 min numa viagem de 86 min. O barracão soma
   * só o **rodar**: os 20 min parados são de entrega, e o barracão não é uma (D3).
   */
  it('o total do roteiro inclui o rodar da perna do barracão', () => {
    const geometry = geometria({
      depot: { absence: null, leadingLegs: 1, origin: null, trailingLegs: 0 },
      legs: [TRECHO_BARRACAO, TRECHO_ENTREGAS],
    })
    const legs = buildAssemblyLegs({ geometry, points: PARADAS })
    const depotLegs = buildAssemblyDepotLegs({ geometry, points: PARADAS })

    /** 40 min entre entregas + 20 min parados = 60; mais 50 min do barracão = 110. */
    expect(totalAssemblyMinutes(legs)).toBe(60)
    expect(totalAssemblyMinutes(legs, depotLegs)).toBe(110)
  })

  /** Barracão sem coordenada não acrescenta trecho nenhum: nada é inventado (D2). */
  it('sem coordenada de barracão não há trecho de barracão', () => {
    expect(
      buildAssemblyDepotLegs({
        geometry: geometria({
          depot: { absence: 'not_configured', leadingLegs: 0, origin: null, trailingLegs: 0 },
          legs: [TRECHO_ENTREGAS],
        }),
        points: PARADAS,
      }),
    ).toEqual([])
  })
})

describe('a tela declara a perna que ficou de fora (spec 097 D2)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('imprime o aviso pela razão que a API mandou, nunca em silêncio', () => {
    expect(source).toInclude('geometryQuery.data?.depot?.absence')
    expect(source).toInclude('assemblyMap.depot.absence.')
    expect(trip.assemblyMap.depot.absence.not_configured.length).toBeGreaterThan(0)
    expect(trip.assemblyMap.depot.absence.not_geocoded.length).toBeGreaterThan(0)
  })

  /** As duas razões dizem coisas diferentes: uma pede cadastro, a outra pede geocodificação. */
  it('as duas razões não dizem a mesma coisa', () => {
    expect(trip.assemblyMap.depot.absence.not_configured).not.toBe(
      trip.assemblyMap.depot.absence.not_geocoded,
    )
  })

  /** O total do roteiro soma os trechos do barracão — senão o aviso existiria e o número não. */
  it('o total do roteiro soma os trechos do barracão', () => {
    expect(source).toInclude('buildAssemblyDepotLegs')
    expect(source).toInclude('totalAssemblyMinutes(legs, depotLegs)')
  })

  /**
   * D3: o barracão entra no traçado e na conta, e **não** na lista numerada de paradas. A lista
   * continua saindo de `map.points`, que a tela monta só com as entregas.
   */
  it('não mistura o barracão na lista de pontos que numera as paradas', () => {
    expect(source).toInclude('map.points')
    expect(source).not.toInclude('depot.origin')
    expect(source).not.toInclude('depotPoint')
  })

  /** D1: a política de fim é da configuração, e a tela não nomeia nenhuma. */
  it('a tela não fixa política de fim nenhuma', () => {
    expect(source).not.toInclude("'depot'")
    expect(source).not.toInclude('"depot"')
    expect(source).not.toInclude("'last_stop'")
  })
})
