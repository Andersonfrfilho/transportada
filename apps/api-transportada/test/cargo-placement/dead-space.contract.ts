/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type CargoPlacement,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import { ATEGO_85_STOPS } from '../fixtures/real-mixed-cargo.fixture.js'
import { simulateUnloading } from './unloading-simulation.js'

/**
 * Spec 117: **a caixa pequena vai para onde a caixa da carga não cabe**, e **a busca de lugar vai até
 * a porta**.
 *
 * ⚠️ As afirmações são de **propriedade** — quanto uma caixa pequena custa, quanto fica fora —, nunca
 * a posição de uma caixa. Os limites saem da geometria, não de uma porcentagem escolhida.
 */
const ATEGO_BED = {
  heightM: '2.300',
  lengthM: '7.400',
  source: 'measured',
  widthM: '2.470',
} as const
const PRESUMED_HEIGHT_MM = 210
/** Quantas caixas presumidas uma coluna do baú empilha: 2,30 m ÷ 0,21 m. */
const BOXES_PER_COLUMN = Math.floor(2300 / PRESUMED_HEIGHT_MM)
/** A densidade da evidência da spec 117: um cubo medido a cada cinco paradas. */
const CUBE_EVERY_STOPS = 5
/**
 * Spec 118: a presumida vai com 0,261 m ao longo do comprimento — o rendimento é contado em células —,
 * então cabem 6 na largura de 2,47 m (a de 0,371 m ocupa 0,40) e cada fileira gasta 0,30 m.
 */
const PRESUMED_ACROSS = Math.floor((2.47 - 0.371) / 0.4) + 1
const PRESUMED_ROWS = Math.floor(7.4 / 0.3)
/**
 * A escada da porta: a fileira encostada nela sobe três vezes a base (3 camadas de 10), a seguinte
 * três vezes a base acima dela (6) e a terceira 9 — 7 + 4 + 1 camadas a menos. É o que a porta, que não
 * é parede, tira de qualquer carga que chegue até ela.
 */
const DOOR_STAIRCASE_BOXES = (7 + 4 + 1) * PRESUMED_ACROSS
/**
 * ⚠️ Spec 118: a décima camada fica a 0,90 m da frente da entrega posterior — além da mão — e só a
 * entrega que está ao alcance a enche. No pior caso ela falta no baú inteiro.
 */
const UNREACHABLE_TOP_BOXES = PRESUMED_ROWS * PRESUMED_ACROSS

function box(input: {
  readonly count: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly source: 'estimated' | 'measured'
  readonly stopSequence: number
  readonly widthMm: number
}): PlacementBox {
  return {
    ...input,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `P${String(input.stopSequence)}`,
    maxStackCount: null,
  }
}

function drawnOf(plan: CargoPlacement | null): CargoPlacement['layers'][number]['boxes'] {
  return (plan?.layers ?? []).flatMap((layer) => layer.boxes)
}

function unplacedOf(plan: CargoPlacement | null): number {
  return (plan?.unplaced ?? []).reduce((total, entry) => total + entry.count, 0)
}

/** As 85 paradas reais do Atego, todas na caixa presumida — a carga sem nenhum tamanho misturado. */
function presumedAtegoStops(): readonly (readonly [number, number])[] {
  const totals = new Map<number, number>()
  for (const [stop, count] of ATEGO_85_STOPS) totals.set(stop, (totals.get(stop) ?? 0) + count)

  return [...totals.entries()]
}

function presumedOf(stop: number, count: number): PlacementBox {
  return box({
    count,
    heightMm: PRESUMED_HEIGHT_MM,
    lengthMm: 371,
    source: 'estimated',
    stopSequence: stop,
    widthMm: 261,
  })
}

describe('a caixa pequena vai para onde a caixa da carga não cabe (spec 117)', () => {
  /**
   * ⚠️ Um cubo medido de 10 cm entrava antes das presumidas da própria parada, sentava no meio da
   * fileira e empurrava as seguintes 10 cm para o lado. A chaminé que sobrava tirava o apoio da fileira
   * de trás naquela coluna, e cada camada acima perdia uma caixa. Medido nas 85 paradas reais: com um
   * cubo a cada cinco paradas as presumidas caíam de 1344 para 1093 — 17 cubos custando 251 caixas.
   *
   * O limite é físico: uma caixa pequena ocupa no máximo **uma coluna** do baú. Custar mais que isso é
   * a desarrumação que ela provoca em volta, não o lugar que ela ocupa.
   *
   * ⚠️ Spec 120: **volta ao caso isolado** — um cubo a cada cinco paradas, a carga da evidência da 117. A
   * spec 118 tinha passado a somar três densidades (3, 5 e 10), e a soma escondia que esta aqui estourava
   * sozinha: 185 contra 170. A conta é sobre o **mapa recomendado** (`complement: false`): o cubo mexe na
   * arrumação dele, e é ela que esta regra protege; o complemento só ocupa o que sobra.
   *
   * ⚠️ **Spec 130: o limite volta a uma coluna por cubo** (17 × 10 = 170). A 120 o tinha afrouxado para
   * uma coluna e uma caixa (187) porque, sob a regra do alcance da 118, nenhum espaço morto fica ao
   * alcance — medido, 0 de 17 cubos acharam um, e os 4100 assentos do espaço morto foram recusados
   * **todos** pela mão, nenhum pela sombra nem pela esbeltez. O cubo sentava no primeiro lugar nivelado
   * da fileira e empurrava a vizinha. Afrouxar o limite escondia isso; o conserto são duas regras de
   * lugar, nenhuma de física: a caixa pequena entra **depois** das grandes da própria entrega, e sem
   * espaço morto ao alcance vai para o **assento ao alcance mais alto**. Medido: 185 → 53. As três
   * densidades são cobradas em separado — a 118 recusou adiar o cubo porque consertava esta e estourava
   * a de dez (109 contra 80); com o assento mais alto a de dez fica em 46.
   */
  test.each([3, CUBE_EVERY_STOPS, 10])(
    'um cubo de 10 cm a cada %i paradas não custa mais que a coluna em que entra',
    (every) => {
      expect(costOfCubes(every)).toBeLessThanOrEqual(
        presumedAtegoStops().filter(([stop]) => stop % every === 0).length * BOXES_PER_COLUMN,
      )
    },
  )

  /**
   * ⚠️ Spec 130: subir o cubo não pode custar apoio. O primeiro assento mais alto que a busca achou para
   * o cubo da última entrega era o topo da própria pilha, a 0,63 m, encostado na testeira — e o bloco é
   * deslocado para a porta depois de empacotado: o vão de 0,119 m que sobra lá passa do giro da pilha
   * de base 10 cm, e a simulação o achava sem apoio no último passo da descarga.
   */
  test.each([3, CUBE_EVERY_STOPS, 10])(
    'com um cubo a cada %i paradas, toda caixa fica de pé em cada passo da descarga',
    (every) => {
      const plan = placeWithCubes(every)
      const report = simulateUnloading(plan, { heightM: 2.3, lengthM: 7.4, widthM: 2.47 })

      expect(report.unsupported).toEqual([])
      expect(report.stuck).toEqual([])
    },
  )
})

function placeWithCubes(every: number): CargoPlacement {
  const stops = presumedAtegoStops()
  const plan = resolveCargoPlacement({
    bed: ATEGO_BED,
    boxes: [
      ...stops.map(([stop, count]) => presumedOf(stop, count)),
      ...stops
        .filter(([stop]) => stop % every === 0)
        .map(([stop]) =>
          box({
            count: 1,
            heightMm: 100,
            lengthMm: 100,
            source: 'measured',
            stopSequence: stop,
            widthMm: 100,
          }),
        ),
    ],
    complement: false,
    payloadRatio: '0.9897',
  })
  if (plan === null) throw new Error('o Atego tem baú medido')

  return plan
}

/** Quantas presumidas o mapa recomendado perde com um cubo medido de 10 cm a cada `every` paradas. */
function costOfCubes(every: number): number {
  const stops = presumedAtegoStops()
  const presumedAlone = drawnOf(
    resolveCargoPlacement({
      bed: ATEGO_BED,
      boxes: stops.map(([stop, count]) => presumedOf(stop, count)),
      complement: false,
      payloadRatio: '0.9897',
    }),
  ).length
  const cubeStops = stops.filter(([stop]) => stop % every === 0)
  const drawnMixed = drawnOf(
    resolveCargoPlacement({
      bed: ATEGO_BED,
      boxes: [
        ...stops.map(([stop, count]) => presumedOf(stop, count)),
        ...cubeStops.map(([stop]) =>
          box({
            count: 1,
            heightMm: 100,
            lengthMm: 100,
            source: 'measured',
            stopSequence: stop,
            widthMm: 100,
          }),
        ),
      ],
      complement: false,
      payloadRatio: '0.9897',
    }),
  )

  /** Todo cubo entra no mapa recomendado: mandá-lo para fora não é conserto, é esconder o custo. */
  expect(drawnMixed.filter((entry) => entry.source === 'measured').length).toBe(cubeStops.length)
  return presumedAlone - drawnMixed.filter((entry) => entry.source === 'estimated').length
}

describe('a busca de lugar vai até a porta (spec 116, contrato da spec 117)', () => {
  /**
   * ⚠️ O teto de tentativas por caixa era 64 fileiras para qualquer baú. Cada avanço da fronteira custa
   * duas passadas da testeira até ela, e num baú de 7,40 m isso passa de 64 perto da porta: a busca
   * desistia com lugar livre adiante, e a memória de formato recusava as gêmeas sem procurar. Medido
   * nesta carga: 1285 de 1396 caixas com o teto fixo, 1368 com o teto proporcional às fileiras.
   *
   * ⚠️ O que fica fora não passa da escada da porta — é a única perda que a física exige.
   *
   * ⚠️ Spec 118: soma-se a camada de cima fora do alcance da mão (`UNREACHABLE_TOP_BOXES`). Medido: 149
   * fora de 1396 contra o teto de 72 + 144. E esta carga deixou de separar o teto fixo de 64 tentativas
   * (150 fora, contra 149): quem guarda a spec 116 agora é o Accelo real de 24 paradas, que com 64
   * fixas cai de 500 para 477 caixas (`real-mixed-cargo.contract.ts`).
   */
  test('num baú de 7,40 m com 85 paradas, o que fica fora cabe na escada da porta', () => {
    const boxes = Array.from({ length: 85 }, (_, index) => index + 1).flatMap((stop) => [
      presumedOf(stop, 16),
      ...(stop % 7 === 0
        ? [
            box({
              count: 3,
              heightMm: 250,
              lengthMm: 400,
              source: 'measured',
              stopSequence: stop,
              widthMm: 300,
            }),
          ]
        : []),
    ])
    const requested = boxes.reduce((total, entry) => total + entry.count, 0)
    const plan = resolveCargoPlacement({ bed: ATEGO_BED, boxes, payloadRatio: '0.9897' })

    expect(requested).toBeLessThan(1500)
    expect(plan?.unplaced.filter((entry) => entry.reason === 'tooMany')).toEqual([])
    expect(unplacedOf(plan)).toBeLessThanOrEqual(DOOR_STAIRCASE_BOXES + UNREACHABLE_TOP_BOXES)
  })
})
