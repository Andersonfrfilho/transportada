/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { MeshFeature } from '@/modules/shared/ibgeMesh.service'

import { buildAssemblyLegs, totalAssemblyMinutes } from '@/modules/trip/shared/assemblyLeg.service'
import {
  buildAssemblyMap,
  ASSEMBLY_MAP_VIEWBOX,
  type AssemblyMapPoint,
} from '@/modules/trip/shared/assemblyMap.service'
import type { RouteGeometry } from '@/modules/trip/shared/routeGeometry.service'
import { documentIdsOf, toCityOrderFromSolver } from '@/modules/trip/shared/solverCityOrder.service'
import { resolveRouteFinish } from '@/modules/trip/shared/routeSchedule.service'
import {
  moveCity,
  proposeCityOrder,
  reconcileCityOrder,
  resolveStopOrder,
} from '@/modules/trip/shared/assemblyOrder.service'

const RIBEIRAO = '3543402'
const BARRINHA = '3505500'
const SERTAOZINHO = '3551702'

/** Quadrados de um grau, longe de zero para a correção do cosseno ter efeito mensurável. */
function square(code: string, longitude: number, latitude: number): MeshFeature {
  return {
    code,
    rings: [
      [
        [longitude, latitude],
        [longitude + 1, latitude],
        [longitude + 1, latitude + 1],
        [longitude, latitude + 1],
      ],
    ],
  }
}

const FEATURES = [
  square(RIBEIRAO, -47.8, -21.2),
  square(BARRINHA, -48.2, -21.2),
  square(SERTAOZINHO, -47.9, -22.0),
]

function note(
  id: string,
  cityCode: null | string,
  city = 'Cidade',
  extra: Partial<{
    addressNumber: null | string
    latitude: null | string
    locationPrecision: null | string
    longitude: null | string
    postalCode: null | string
  }> = {},
) {
  return {
    address: `Rua ${id}, 100`,
    addressNumber: '100',
    city,
    cityCode,
    id,
    latitude: null,
    locationPrecision: null,
    longitude: null,
    number: `00000${id}`,
    postalCode: '14020000',
    recipient: `Cliente ${id}`,
    state: 'SP',
    ...extra,
  }
}

describe('mapa da montagem', () => {
  it('numera a cidade pela ordem em que ela chega, e uma cidade é um ponto só', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [note('a', RIBEIRAO), note('b', RIBEIRAO), note('c', BARRINHA)],
    })

    expect(map.points.map((point) => point.sequence)).toEqual([1, 2])
    expect(map.points.map((point) => point.cityCode)).toEqual([RIBEIRAO, BARRINHA])
  })

  /**
   * A razão de existir do cinza claro: se a janela enquadrasse só o que foi escolhido, a cidade
   * que faltou cairia fora do desenho — justamente a que o operador precisa ver.
   */
  it('enquadra a cidade que ficou de fora junto com a escolhida', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [note('c', SERTAOZINHO)],
      selected: [note('a', RIBEIRAO)],
    })

    const [outside] = map.nearby
    expect(outside).toBeDefined()
    expect(outside?.x).toBeGreaterThanOrEqual(0)
    expect(outside?.x).toBeLessThanOrEqual(ASSEMBLY_MAP_VIEWBOX)
    expect(outside?.y).toBeGreaterThanOrEqual(0)
    expect(outside?.y).toBeLessThanOrEqual(ASSEMBLY_MAP_VIEWBOX)
    /** Ela não é parada: sem sequência, e fora da linha do roteiro. */
    expect(outside?.sequence).toBeNull()
  })

  it('não conta como ausência a cidade que já está na seleção', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [note('b', RIBEIRAO)],
      selected: [note('a', RIBEIRAO)],
    })

    expect(map.nearby).toEqual([])
  })

  /** Mapa visto pela metade é pior que mapa com aviso ao lado. */
  it('nomeia a cidade sem polígono na malha em vez de escondê-la', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [note('a', RIBEIRAO), note('z', '9999999', 'Cidade Fantasma')],
    })

    expect(map.points).toHaveLength(1)
    expect(map.unmapped).toEqual(['Cidade Fantasma/SP'])
  })

  it('não inverte o norte: latitude maior desenha mais acima', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [note('a', RIBEIRAO), note('c', SERTAOZINHO)],
    })

    const [north, south] = map.points
    expect(north?.y).toBeLessThan(south?.y ?? 0)
  })
})

describe('ordem da montagem', () => {
  it('põe cidade nova no fim e tira a que saiu, sem apagar o arranjo', () => {
    const order = reconcileCityOrder({
      cityCodes: [BARRINHA, SERTAOZINHO],
      order: [BARRINHA, RIBEIRAO],
    })

    expect(order).toEqual([BARRINHA, SERTAOZINHO])
  })

  /**
   * Medido na tela: dez notas da mesma cidade punham a cidade duas vezes na ordem, e aí `moveCity`
   * tirava a primeira entrada e a devolvia na posição da segunda — a mesma lista. O botão de mover
   * clicava e nada acontecia, sem erro, sem aviso.
   */
  it('não repete a cidade quando várias notas vão para ela', () => {
    const order = reconcileCityOrder({
      cityCodes: [RIBEIRAO, BARRINHA, RIBEIRAO],
      order: [],
    })

    expect(order).toEqual([RIBEIRAO, BARRINHA])
    expect(moveCity({ code: RIBEIRAO, direction: 1, order })).toEqual([BARRINHA, RIBEIRAO])
  })

  it('ignora nota sem cidade em vez de criar uma parada vazia', () => {
    expect(reconcileCityOrder({ cityCodes: ['', BARRINHA], order: [] })).toEqual([BARRINHA])
  })

  it('move a cidade e não sai da lista nas pontas', () => {
    const order = [RIBEIRAO, BARRINHA, SERTAOZINHO]
    expect(moveCity({ code: BARRINHA, direction: -1, order })).toEqual([
      BARRINHA,
      RIBEIRAO,
      SERTAOZINHO,
    ])
    expect(moveCity({ code: RIBEIRAO, direction: -1, order })).toEqual(order)
  })

  /**
   * A primeira parada é decisão do operador; a proposta reordena o resto a partir dela.
   *
   * ⚠️ **A ordem é feita de chave de parada, não de código de cidade** — quem a alimenta é
   * `reconcileCityOrder`, com `buildStopAddressKey`. A versão anterior deste teste passava
   * `[RIBEIRAO, SERTAOZINHO, BARRINHA]`, que é consistente dentro do teste e **não existe na tela**:
   * ele ficou verde enquanto a proposta era um no-op mudo em produção. Medido no app: a ordem real
   * é `["3543402|14078369|289", …]`.
   */
  it('propõe pelo vizinho mais próximo mantendo a primeira parada', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [note('a', RIBEIRAO), note('c', SERTAOZINHO), note('b', BARRINHA)],
    })
    const chaves = map.points.map((point) => point.stopKey)
    const proposal = proposeCityOrder({ order: chaves, points: map.points })

    expect(proposal[0]).toBe(chaves[0])
    expect([...proposal].sort()).toEqual([...chaves].sort())
  })

  /**
   * A rota de reordenação exige a lista **completa** das paradas da viagem. Uma lista curta seria
   * recusada com a viagem já criada — o pior momento possível para descobrir isso.
   */
  it('leva ao fim a parada que não está na ordem, sem descartá-la', () => {
    const stopIds = resolveStopOrder({
      order: ['3543402|14020000|100', '3505500|14400000|44'],
      stops: [
        { addressKey: '3505500|14400000|44', id: 'stop-barrinha' },
        { addressKey: null, id: 'stop-orfa' },
        { addressKey: '3543402|14020000|100', id: 'stop-ribeirao' },
      ],
    })

    expect(stopIds).toEqual(['stop-ribeirao', 'stop-barrinha', 'stop-orfa'])
  })

  /**
   * ⚠️ A parada é o **endereço**, não a cidade: dois clientes do mesmo município são duas paradas,
   * e agrupá-los numa só faria o roteiro desenhado divergir do roteiro que a viagem teria.
   */
  it('separa dois endereços do mesmo município em duas paradas', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [
        note('a', RIBEIRAO, 'Ribeirao', { addressNumber: '100', postalCode: '14020000' }),
        note('b', RIBEIRAO, 'Ribeirao', { addressNumber: '432', postalCode: '14095120' }),
      ],
    })

    expect(map.points).toHaveLength(2)
    expect(map.points.map((point) => point.sequence)).toEqual([1, 2])
  })

  /** Mesmo endereço, notas diferentes: uma parada só — é a mesma loja recebendo duas cargas. */
  it('funde duas notas do mesmo endereço numa parada', () => {
    const map = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [
        note('a', RIBEIRAO, 'Ribeirao', { addressNumber: '100', postalCode: '14020000' }),
        note('b', RIBEIRAO, 'Ribeirao', { addressNumber: 'nº 100', postalCode: '14020-000' }),
      ],
    })

    expect(map.points).toHaveLength(1)
    expect(map.points[0]?.notes).toHaveLength(2)
  })

  /**
   * A coordenada de endereço vence o centroide — e só ela tira a marca de aproximação. Precisão
   * `city` é o próprio centroide devolvido pela cascata: aceitá-la apagaria a marca (ADR-0044 §5).
   */
  it('usa a coordenada do endereço e só então deixa de marcar o ponto como aproximado', () => {
    const exato = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [
        note('a', RIBEIRAO, 'Ribeirao', {
          latitude: '-21.1699',
          locationPrecision: 'postal_code',
          longitude: '-47.8103',
        }),
      ],
    })
    expect(exato.points[0]?.isApproximate).toBe(false)
    expect(exato.points[0]?.latitude).toBeCloseTo(-21.1699, 4)

    const palpite = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [
        note('a', RIBEIRAO, 'Ribeirao', {
          latitude: '-21.1699',
          locationPrecision: 'city',
          longitude: '-47.8103',
        }),
      ],
    })
    expect(palpite.points[0]?.isApproximate).toBe(true)
  })
})

/**
 * Spec 079: o tempo e a distância do trecho saem do **roteirizador**, na mesma resposta que desenha
 * a linha. Antes disto a tela estimava por haversine × 1,3 ÷ 55 km/h — número que parecia medido e
 * não era, e que a ADR-0044 §5 proíbe justamente por isso.
 */
describe('trechos da montagem', () => {
  const parada = (cityCode: string, sequence: number): AssemblyMapPoint => ({
    cityCode,
    isApproximate: false,
    label: cityCode,
    latitude: -21.17,
    longitude: -47.81,
    notes: [],
    sequence,
    stopKey: `${cityCode}-x`,
    x: 50,
    y: 50,
  })

  const PONTOS = [parada(RIBEIRAO, 1), parada(BARRINHA, 2), parada(SERTAOZINHO, 3)]

  const estrada = (legs: RouteGeometry['legs']): RouteGeometry => ({
    legs,
    points: [
      { latitude: '-21.17000', longitude: '-47.81000' },
      { latitude: '-21.20000', longitude: '-47.77000' },
    ],
    source: 'road',
  })

  it('converte metro e segundo na unidade da tela, sem recalcular nada', () => {
    const legs = buildAssemblyLegs({
      geometry: estrada([
        { distanceMetres: 24_500, durationSeconds: 1_800 },
        { distanceMetres: 11_000, durationSeconds: 600 },
      ]),
      points: PONTOS,
    })

    expect(legs).toHaveLength(2)
    expect(legs[0]?.distanceKilometres).toBe(24.5)
    expect(legs[0]?.drivingMinutes).toBe(30)
    /** O rodar medido mais os 20 min parados por entrega, que são declarados e não medidos. */
    expect(legs[0]?.minutes).toBe(50)
    expect(legs[0]?.fromCityCode).toBe(RIBEIRAO)
    expect(legs[0]?.toCityCode).toBe(BARRINHA)
  })

  /**
   * ⚠️ O ponto central: sem roteirizador **não há tempo**, e não há estimativa no lugar dele. A tela
   * some com o número em vez de imprimir palpite com cara de medida.
   */
  it('não estima quando o roteirizador não respondeu', () => {
    const legs = buildAssemblyLegs({
      geometry: { legs: [], points: [], source: 'unavailable' },
      points: PONTOS,
    })

    expect(legs).toEqual([])
  })

  it('não estima quando não há geometria nenhuma', () => {
    expect(buildAssemblyLegs({ geometry: null, points: PONTOS })).toEqual([])
  })

  /**
   * ⚠️ Contagem que não bate é resposta que não casa com o pedido. Casar trecho com parada errada
   * poria o tempo de um caminho ao pé de outro — plausível e errado.
   */
  it('descarta tudo quando a contagem de trechos não bate com as paradas', () => {
    const legs = buildAssemblyLegs({
      geometry: estrada([{ distanceMetres: 24_500, durationSeconds: 1_800 }]),
      points: PONTOS,
    })

    expect(legs).toEqual([])
  })

  it('soma o roteiro inteiro para a tela comparar com o turno', () => {
    const legs = buildAssemblyLegs({
      geometry: estrada([
        { distanceMetres: 24_500, durationSeconds: 1_800 },
        { distanceMetres: 11_000, durationSeconds: 600 },
      ]),
      points: PONTOS,
    })

    expect(totalAssemblyMinutes(legs)).toBe(80)
  })
})

/**
 * Estas duas são de fiação, então o contrato é por **texto de fonte**: esta app não tem DOM, e o que
 * se pode afirmar aqui é que o componente está ligado do jeito que a regra exige.
 */
describe('o mapa da montagem só existe quando há o que mostrar', () => {
  const fonte = readFileSync(
    new URL('../../src/modules/trip/components/TripAssemblyMap.component.tsx', import.meta.url),
    'utf8',
  )

  /**
   * ⚠️ O portão antigo exigia **também** nenhuma cidade por perto, então seleção vazia com filtro
   * aberto desenhava moldura, controles e nada dentro. Quadro vazio lê como defeito.
   */
  it('esconde o mapa quando nenhuma nota foi escolhida', () => {
    expect(fonte).toContain('if (map.points.length === 0) {')
    expect(fonte).not.toContain('map.points.length === 0 && map.nearby.length === 0')
  })

  /**
   * ⚠️ Não é micro-otimização: o MapLibre no pacote principal leva o bundle acima do teto de 2 MiB
   * do precache do workbox, e o **build de produção do PWA falha**. Este teste é o que impede o
   * import estático de voltar sem que ninguém note até o deploy.
   */
  it('carrega o mapa sob demanda, fora do pacote principal', () => {
    expect(fonte).toContain('lazy(')
    expect(fonte).toContain("import('./AssemblyVectorMap.component')")
    expect(fonte).not.toContain("import { AssemblyVectorMap } from './AssemblyVectorMap.component'")
  })

  /** Carregamento é esqueleto com a forma do que ele antecede — nunca texto solto nem `null`. */
  it('mostra esqueleto enquanto o mapa carrega', () => {
    expect(fonte).toContain('<Suspense')
    expect(fonte).toContain('SkeletonGroup')
    expect(fonte).toContain('MAP_HEIGHT')
  })
})

/**
 * A ordem do **roteirizador** traduzida para a ordem de cidades do diálogo. Medido no OSRM local com
 * três paradas reais: fixar origem e deixar o fim livre dá 102,8 km, contra 138,4 km travando as
 * duas pontas — 35 km de diferença, que é o que esta tradução precisa não estragar.
 */
describe('ordem vinda do roteirizador', () => {
  const RIB = `${RIBEIRAO}|14078369|289`
  const BAR = `${BARRINHA}|14210000|533`
  const SER = `${SERTAOZINHO}|13660328|25`
  const ORDEM = [RIB, BAR, SER]

  /**
   * ⚠️ A ordem do diálogo é feita de **chave de parada** (`cidade|CEP|número`), apesar do nome
   * `AssemblyCityOrder` — quem a alimenta é `buildStopAddressKey`. É a mesma chave que
   * `route_suggestion_stops.address_key` carrega, e por isso o casamento é direto. Foi essa
   * confusão de nome que fez a primeira versão desta tradução casar por `cityCode` e não achar
   * nada: ela caía no caminho de "nada casou" e devolvia a ordem intacta, sem erro nenhum.
   */
  it('reordena pelas sequências que o solver devolveu', () => {
    const ordem = toCityOrderFromSolver({
      order: ORDEM,
      stops: [
        { addressKey: SER, sequence: 1 },
        { addressKey: RIB, sequence: 2 },
        { addressKey: BAR, sequence: 3 },
      ],
    })

    expect(ordem).toEqual([SER, RIB, BAR])
  })

  /** Parada que o solver não posicionou fica no fim, na ordem em que estava — nunca reinventada. */
  it('mantém no fim o que o solver não posicionou', () => {
    const ordem = toCityOrderFromSolver({ order: ORDEM, stops: [{ addressKey: SER, sequence: 1 }] })

    expect(ordem).toEqual([SER, RIB, BAR])
  })

  /** Nenhuma parada reconhecida devolve a ordem intacta — foi exatamente o defeito da 1ª versão. */
  it('devolve a ordem intacta quando nada casa', () => {
    const ordem = toCityOrderFromSolver({
      order: ORDEM,
      stops: [{ addressKey: 'chave|que|ninguem|tem', sequence: 1 }],
    })

    expect(ordem).toEqual(ORDEM)
  })

  /**
   * ⚠️ O pedido leva **id de NF-e persistida**, não coordenada — é assim que o solver alcança
   * endereço geocodificado, janela e peso. Uma parada com duas notas manda as duas.
   */
  it('reúne os identificadores de todas as notas das paradas', () => {
    const ponto = (cityCode: string, notes: AssemblyMapPoint['notes']): AssemblyMapPoint => ({
      cityCode,
      isApproximate: false,
      label: cityCode,
      latitude: -21.17,
      longitude: -47.81,
      notes,
      sequence: null,
      stopKey: `${cityCode}|x|y`,
      x: 50,
      y: 50,
    })

    const pontos = [
      ponto(RIBEIRAO, [note('n1', RIBEIRAO), note('n2', RIBEIRAO)]),
      ponto(BARRINHA, [note('n3', BARRINHA)]),
    ]

    expect(documentIdsOf(pontos)).toEqual(['n1', 'n2', 'n3'])
  })
})

/**
 * O término previsto do roteiro. O horário é do **solver** (`estimatedArrivalAt`), que conta a saída
 * do depósito, a estrada, o tempo de serviço por parada e as pausas de jornada — recalcular aqui
 * daria um segundo término discordando do primeiro.
 */
describe('término previsto do roteiro', () => {
  const parada = (sequence: number, estimatedArrivalAt: null | string) => ({
    estimatedArrivalAt,
    sequence,
  })

  it('toma a chegada da última parada, não da primeira', () => {
    const fim = resolveRouteFinish({
      distanceMetres: 88_600,
      durationSeconds: 5_400,
      stops: [
        parada(1, '2026-09-08T11:00:00Z'),
        parada(3, '2026-09-08T17:40:00Z'),
        parada(2, '2026-09-08T14:20:00Z'),
      ],
    })

    expect(fim.arrivalIso).toBe('2026-09-08T17:40:00Z')
    expect(fim.distanceKilometres).toBe(88.6)
    expect(fim.minutes).toBe(90)
  })

  /** ⚠️ Sem janela nem histórico o solver devolve chegada nula — e a tela não inventa horário. */
  it('não inventa término quando o solver não previu chegada', () => {
    const fim = resolveRouteFinish({
      distanceMetres: null,
      durationSeconds: null,
      stops: [parada(1, null), parada(2, null)],
    })

    expect(fim.arrivalIso).toBeNull()
    expect(fim.warnings).toEqual([])
  })

  it('avisa quando o roteiro termina em feriado nacional', () => {
    const fim = resolveRouteFinish({
      distanceMetres: 1,
      durationSeconds: 1,
      /** 25/12 é Natal, e cai numa sexta em 2026 — o aviso é do feriado, não do dia da semana. */
      stops: [parada(1, '2026-12-25T18:00:00Z')],
    })

    expect(fim.warnings.map((warning: { kind: string }) => warning.kind)).toEqual(['feriado'])
    expect(fim.warnings[0]?.detail).toContain('Natal')
  })

  it('avisa quando o roteiro termina no fim de semana', () => {
    /** 05/09/2026 é sábado. */
    const fim = resolveRouteFinish({
      distanceMetres: 1,
      durationSeconds: 1,
      stops: [parada(1, '2026-09-05T18:00:00Z')],
    })

    expect(fim.warnings.map((warning: { kind: string }) => warning.kind)).toEqual(['fim-de-semana'])
  })

  /**
   * ⚠️ Dia útil comum não avisa nada. Horário comercial **não** entra: não existe jornada da empresa
   * cadastrada, e "das 8 às 18" seria política de negócio inventada aqui. Estouro de janela do
   * cliente já vem do solver em `violations`.
   */
  it('não avisa em dia útil comum', () => {
    const fim = resolveRouteFinish({
      distanceMetres: 1,
      durationSeconds: 1,
      stops: [parada(1, '2026-09-08T18:00:00Z')],
    })

    expect(fim.warnings).toEqual([])
  })
})

/**
 * ⚠️ **Metade desta base não sabe a rua.** Medido em produção local: 149 endereços com precisão
 * `city`, 147 com `postal_code` e 4 com `rooftop`. Precisão `city` põe o ponto no **centroide do
 * município** — que cai no meio do mato —, e desenhá-lo igual a um endereço conhecido é o modo de
 * falha que a ADR-0044 §1 nomeia: o palpite com cara de dado, mandando alguém procurar porta que
 * não existe. `isApproximate` era calculado e **nenhum componente o lia**.
 */
describe('posição aproximada', () => {
  const fonte = readFileSync(
    new URL('../../src/modules/trip/components/TripAssemblyMap.component.tsx', import.meta.url),
    'utf8',
  )
  const mapa = readFileSync(
    new URL('../../src/modules/trip/components/AssemblyVectorMap.component.tsx', import.meta.url),
    'utf8',
  )

  it('marca a parada aproximada na lista', () => {
    expect(fonte).toContain('point.isApproximate')
    expect(fonte).toContain('assemblyMap.approximate')
  })

  it('marca o pino aproximado no mapa', () => {
    expect(mapa).toContain('approximate: point.isApproximate')
    expect(mapa).toContain('tilePinApproximate')
  })

  /** `buildAssemblyMap` já resolvia isso; o que faltava era alguém ler. */
  it('continua marcando o ponto de precisão de município', () => {
    const mapaMontado = buildAssemblyMap({
      features: FEATURES,
      nearby: [],
      selected: [
        note('a', RIBEIRAO, 'Ribeirao', {
          latitude: '-21.1699',
          locationPrecision: 'city',
          longitude: '-47.8103',
        }),
      ],
    })

    expect(mapaMontado.points[0]?.isApproximate).toBe(true)
  })
})
