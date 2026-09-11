/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  MIN_SUPPORTED_BASE_FRACTION,
  resolveCargoPlacement,
  type CargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import type { LoadingAccess } from '../../src/shared/loading-access.constant.js'
import {
  ACCELO_24_STOPS,
  ATEGO_85_STOPS,
  DAILY_19_STOPS,
  SPRINTER_24_STOPS,
  type RealCargoRow,
} from '../fixtures/real-mixed-cargo.fixture.js'
import { simulateUnloading } from './unloading-simulation.js'

/**
 * Spec 132: a caixa ocupa **a própria medida**, não a célula de 5 cm em que ela cabia.
 *
 * ⚠️ Com a célula a caixa presumida de 0,261 m ocupava 0,30 m e entravam 8 na largura de 2,47 m do
 * Atego em vez de 9; a de 0,371 × 0,261 m reservava 0,40 × 0,30 m do piso — 23,7% a mais de área por
 * caixa, medido nas quatro viagens reais. As afirmações abaixo são de **propriedade** — quantas cabem,
 * que nada fica reservado além da medida, que tudo pousa nivelado sobre apoio real —, nunca a posição
 * de uma caixa: reconstruir a decisão mediria o desempate, não a regra.
 */
const EPSILON = 1e-6
/** O `z` publicado é arredondado ao milímetro. */
const SEAT_TOLERANCE_M = 1e-3
function boxOf(input: {
  count: number
  heightMm: number
  lengthMm: number
  stopSequence: number
  widthMm: number
}): PlacementBox {
  return {
    ...input,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `P${String(input.stopSequence)}`,
    maxStackCount: null,
    source: 'measured',
  }
}

function drawnOf(plan: CargoPlacement | null): PlacedBox[] {
  if (plan === null) throw new Error('a planta devia existir com o baú medido')

  return plan.layers.flatMap((layer) => layer.boxes)
}

function overlaps(fromA: number, sizeA: number, fromB: number, sizeB: number): boolean {
  return fromA < fromB + sizeB - EPSILON && fromB < fromA + sizeA - EPSILON
}

function sharesFootprint(first: PlacedBox, second: PlacedBox): boolean {
  return (
    overlaps(first.xM, first.depthM, second.xM, second.depthM) &&
    overlaps(first.yM, first.widthM, second.yM, second.widthM)
  )
}

/** Pares de caixas que se atravessam — AABB nos três eixos, nunca só os cantos. */
function countCrossings(boxes: readonly PlacedBox[]): number {
  let crossings = 0
  for (const [index, box] of boxes.entries()) {
    for (const other of boxes.slice(index + 1)) {
      if (sharesFootprint(box, other) && overlaps(box.zM, box.heightM, other.zM, other.heightM)) {
        crossings += 1
      }
    }
  }

  return crossings
}

/**
 * A fração da base sobre topo real à altura dela — a soma exata das interseções com as caixas cujo topo
 * é o `z` dela (as caixas não se cruzam, então as interseções não se somam duas vezes).
 *
 * ⚠️ **Spec 135 (decisão do usuário): o balanço é porcentagem da base, não centímetro, e não é mais
 * zero.** A spec 132 afirmava a pegada inteira nivelada, amostrada a cada 5 mm; a regra mudou de
 * propósito — 1 cm de balanço é 96% de apoio numa caixa de 26 cm e 99% numa de 1 m, a mesma régua
 * medindo coisas diferentes —, e o que se afirma agora é a fração mínima declarada.
 */
function supportedFractionOf(box: PlacedBox, boxes: readonly PlacedBox[]): number {
  if (box.zM <= SEAT_TOLERANCE_M) return 1
  let supportedM2 = 0
  for (const other of boxes) {
    if (other === box || Math.abs(other.zM + other.heightM - box.zM) > SEAT_TOLERANCE_M) continue
    const acrossXM =
      Math.min(box.xM + box.depthM, other.xM + other.depthM) - Math.max(box.xM, other.xM)
    const acrossYM =
      Math.min(box.yM + box.widthM, other.yM + other.widthM) - Math.max(box.yM, other.yM)
    if (acrossXM > 0 && acrossYM > 0) supportedM2 += acrossXM * acrossYM
  }

  return supportedM2 / (box.depthM * box.widthM)
}

describe('a caixa ocupa a própria medida (spec 132)', () => {
  /** A fileira de uma caixa só: baú de 0,30 m de fundo e uma camada, tudo o que importa é a largura. */
  const ONE_ROW_BED = {
    heightM: '0.250',
    lengthM: '0.300',
    source: 'measured',
    widthM: '2.470',
  } as const

  test('com a caixa de 0,261 m cabem 9 na largura de 2,47 m, numa entrega', () => {
    const plan = resolveCargoPlacement({
      bed: ONE_ROW_BED,
      boxes: [boxOf({ count: 9, heightMm: 210, lengthMm: 261, stopSequence: 1, widthMm: 261 })],
      payloadRatio: null,
    })

    expect(plan?.unplaced).toEqual([])
    expect(drawnOf(plan)).toHaveLength(9)
  })

  test('com a caixa de 0,261 m cabem 9 na largura de 2,47 m, no bloco por ordem de entrega', () => {
    const plan = resolveCargoPlacement({
      bed: ONE_ROW_BED,
      boxes: [
        boxOf({ count: 5, heightMm: 210, lengthMm: 261, stopSequence: 1, widthMm: 261 }),
        boxOf({ count: 4, heightMm: 210, lengthMm: 261, stopSequence: 2, widthMm: 261 }),
      ],
      payloadRatio: null,
    })

    expect(plan?.unplaced).toEqual([])
    expect(drawnOf(plan)).toHaveLength(9)
    expect(countCrossings(drawnOf(plan))).toBe(0)
  })

  /**
   * ⚠️ Nenhuma caixa reserva espaço maior que a própria medida: numa fileira de caixas iguais, cada
   * uma encosta na seguinte, e a fileira mede exatamente N vezes a caixa.
   */
  test('a fileira de nove caixas de 0,261 m mede 2,349 m, sem vão entre elas', () => {
    const boxes = drawnOf(
      resolveCargoPlacement({
        bed: ONE_ROW_BED,
        boxes: [boxOf({ count: 9, heightMm: 210, lengthMm: 261, stopSequence: 1, widthMm: 261 })],
        payloadRatio: null,
      }),
    )
    const across = [...boxes].sort((first, second) => first.yM - second.yM)
    const first = across[0]
    const last = across.at(-1)

    expect(first === undefined || last === undefined).toBe(false)
    expect((last?.yM ?? 0) + (last?.widthM ?? 0) - (first?.yM ?? 0)).toBeCloseTo(9 * 0.261, 6)
    for (const [index, box] of across.slice(1).entries()) {
      const previous = across[index]
      expect(box.yM - ((previous?.yM ?? 0) + (previous?.widthM ?? 0))).toBeCloseTo(0, 6)
    }
  })

  /**
   * ⚠️ **A tolerância de borda é uma só, e ela é testada nas bordas.** `0.2 × 3` dá
   * `0.6000000000000001` e `0.143 × 7` dá `1.0010000000000001` em binário: sem tolerância a terceira
   * e a sétima caixa passavam da parede por 1e-16 m e saíam `bedFull` — o mesmo defeito da escada de
   * `0.6 / 0.05` (spec 099), agora sem a célula para escondê-lo.
   */
  test.each([
    ['0,200 m × 3 = 0,600 m', 200, 3, '0.600'],
    ['0,143 m × 7 = 1,001 m', 143, 7, '1.001'],
    ['0,261 m × 9 = 2,349 m', 261, 9, '2.349'],
  ])('caixas que enchem a largura exata cabem todas: %s', (_, sizeMm, count, widthM) => {
    /** Uma fileira só: o fundo do baú é menor que duas caixas. */
    const lengthM = ((sizeMm * 1.5) / 1000).toFixed(3)
    const boxes = drawnOf(
      resolveCargoPlacement({
        bed: { heightM: '0.250', lengthM, source: 'measured', widthM },
        boxes: [
          boxOf({ count, heightMm: 200, lengthMm: sizeMm, stopSequence: 1, widthMm: sizeMm }),
        ],
        payloadRatio: null,
      }),
    )

    expect(boxes).toHaveLength(count)
    expect(countCrossings(boxes)).toBe(0)
    for (const box of boxes)
      expect(box.yM + box.widthM).toBeLessThanOrEqual(Number(widthM) + EPSILON)
  })
})

type RealLoad = Readonly<{
  bed: Readonly<{
    heightM: string
    lengthM: string
    source: 'measured' | 'reference'
    widthM: string
  }>
  /** O que `dc1b6128` desenhava — a célula de 5 cm —, e que nenhuma viagem pode perder. */
  before: Readonly<{ drawn: number; recommended: number; stopsOut: readonly number[] }>
  loadingAccess: LoadingAccess
  name: string
  payloadRatio: string
  rows: readonly RealCargoRow[]
}>

const REAL_LOADS: readonly RealLoad[] = [
  {
    bed: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
    before: { drawn: 481, recommended: 445, stopsOut: [] },
    loadingAccess: 'rear',
    name: 'RTC-4H67 Daily',
    payloadRatio: '0.9007',
    rows: DAILY_19_STOPS,
  },
  {
    bed: { heightM: '1.900', lengthM: '3.400', source: 'measured', widthM: '1.780' },
    before: { drawn: 252, recommended: 252, stopsOut: [] },
    loadingAccess: 'rear_and_side',
    name: 'RTE-6K89 Sprinter',
    payloadRatio: '0.9789',
    rows: SPRINTER_24_STOPS,
  },
  {
    bed: { heightM: '2.200', lengthM: '5.320', source: 'reference', widthM: '2.080' },
    before: { drawn: 500, recommended: 500, stopsOut: [] },
    loadingAccess: 'rear',
    name: 'RTD-5J78 Accelo',
    payloadRatio: '0.6144',
    rows: ACCELO_24_STOPS,
  },
  {
    bed: { heightM: '2.300', lengthM: '7.400', source: 'measured', widthM: '2.470' },
    before: { drawn: 1335, recommended: 1239, stopsOut: [1, 3, 4, 5] },
    loadingAccess: 'rear',
    name: 'RTA-2F45 Atego',
    payloadRatio: '0.9897',
    rows: ATEGO_85_STOPS,
  },
]

function toBoxes(rows: readonly RealCargoRow[]): PlacementBox[] {
  return rows.map(([stopSequence, count, lengthMm, widthMm, heightMm, measured]) => ({
    count,
    heightMm,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: `P${String(stopSequence)}`,
    lengthMm,
    maxStackCount: null,
    source: measured === 1 ? ('measured' as const) : ('estimated' as const),
    stopSequence,
    widthMm,
  }))
}

function placeReal(load: RealLoad): CargoPlacement | null {
  return resolveCargoPlacement({
    bed: load.bed,
    boxes: toBoxes(load.rows),
    loadingAccess: load.loadingAccess,
    payloadRatio: load.payloadRatio,
  })
}

function isComplement(box: PlacedBox): boolean {
  return box.reasons.includes('outOfReach') || box.reasons.includes('needsRehandling')
}

describe('as quatro viagens reais em coordenada exata (spec 132)', () => {
  /**
   * ⚠️ Ganhar no Atego e perder noutra viagem é sobreajuste, e é recusado: nenhuma viagem desenha
   * menos caixa, nem menos caixa recomendada, e nenhuma entrega que aparecia deixa de aparecer.
   */
  test.each(REAL_LOADS.map((load) => [load.name, load] as const))(
    '%s não desenha menos que com a célula de 5 cm',
    (_, load) => {
      const boxes = drawnOf(placeReal(load))
      const drawnStops = new Set(boxes.map((box) => box.stopSequence))
      const stopsOut = [...new Set(load.rows.map(([stop]) => stop))].filter(
        (stop) => !drawnStops.has(stop),
      )

      expect(boxes.length).toBeGreaterThanOrEqual(load.before.drawn)
      expect(boxes.filter((box) => !isComplement(box)).length).toBeGreaterThanOrEqual(
        load.before.recommended,
      )
      for (const stop of stopsOut) expect(load.before.stopsOut).toContain(stop)
    },
  )

  test.each(REAL_LOADS.map((load) => [load.name, load] as const))(
    '%s: dentro do baú, nada se cruza, e toda caixa tem a fração mínima da base sobre apoio real',
    (_, load) => {
      const boxes = drawnOf(placeReal(load))
      const [lengthM, widthM, heightM] = [load.bed.lengthM, load.bed.widthM, load.bed.heightM].map(
        Number,
      )

      expect(countCrossings(boxes)).toBe(0)
      for (const box of boxes) {
        expect(box.xM).toBeGreaterThanOrEqual(-EPSILON)
        expect(box.yM).toBeGreaterThanOrEqual(-EPSILON)
        expect(box.xM + box.depthM).toBeLessThanOrEqual((lengthM ?? 0) + EPSILON)
        expect(box.yM + box.widthM).toBeLessThanOrEqual((widthM ?? 0) + EPSILON)
        expect(box.zM + box.heightM).toBeLessThanOrEqual((heightM ?? 0) + EPSILON)
      }
      /** O `z` publicado é milímetro: a fração pode sair até 1e-3 abaixo por arredondamento. */
      expect(
        boxes.filter((box) => supportedFractionOf(box, boxes) < MIN_SUPPORTED_BASE_FRACTION - 1e-3),
      ).toEqual([])
    },
  )

  /** A descarga entrega por entrega (spec 118) continua de pé, e o recomendado sai todo pela mão. */
  test.each(REAL_LOADS.map((load) => [load.name, load] as const))(
    '%s: ninguém perde apoio na descarga, e o recomendado sai de pé no piso',
    (_, load) => {
      const plan = placeReal(load)
      if (plan === null) throw new Error('a planta devia existir com o baú medido')
      const bed = {
        heightM: Number(load.bed.heightM),
        lengthM: Number(load.bed.lengthM),
        widthM: Number(load.bed.widthM),
      }
      const recommended = drawnOf(plan).filter((box) => !isComplement(box))

      expect(simulateUnloading(plan, bed).unsupported).toEqual([])
      expect(
        simulateUnloading({ ...plan, layers: [{ boxes: recommended, heightM: 0, index: 0 }] }, bed)
          .stuck,
      ).toEqual([])
    },
  )
})
