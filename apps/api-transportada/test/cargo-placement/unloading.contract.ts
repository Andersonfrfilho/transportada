/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { LoadingAccess } from '../../src/shared/loading-access.constant.js'
import {
  isComplementBox,
  resolveCargoPlacement,
  type CargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import {
  ACCELO_24_STOPS,
  ATEGO_85_STOPS,
  DAILY_19_STOPS,
  SPRINTER_24_STOPS,
  type RealCargoRow,
} from '../fixtures/real-mixed-cargo.fixture.js'
import { simulateUnloading, type UnloadingBed } from './unloading-simulation.js'

/**
 * Spec 118: **a planta tem de aguentar a descarga, não só o carregamento.**
 *
 * ⚠️ O empacotador conferia estabilidade com a carga inteira. Na grade (spec 113) cada faixa era
 * empacotada como um baú à parte e a borda dela contava como parede — a vizinha, que sai antes, segurava
 * a pilha. Medido nas quatro viagens de 2026-09-10: 116 de 252 caixas sem apoio na Sprinter e 127 de 500
 * no Accelo, as duas em grade. Em profundidade a pilha aguentava, mas a entrega mais cedo subia em cima
 * das mais tardias, funda demais para a mão: 490 caixas do Atego só saíam subindo na carga.
 *
 * As afirmações são de **propriedade** — ninguém perde apoio, toda entrega sai de pé no piso —, nunca a
 * posição de uma caixa.
 */
type RealLoad = Readonly<{
  bed: Readonly<{
    heightM: string
    lengthM: string
    source: 'measured' | 'reference'
    widthM: string
  }>
  loadingAccess: LoadingAccess
  name: string
  payloadRatio: string
  rows: readonly RealCargoRow[]
}>

const REAL_LOADS: readonly RealLoad[] = [
  {
    bed: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
    loadingAccess: 'rear',
    name: 'RTC-4H67 Daily, 19 paradas',
    payloadRatio: '0.9007',
    rows: DAILY_19_STOPS,
  },
  {
    bed: { heightM: '1.900', lengthM: '3.400', source: 'measured', widthM: '1.780' },
    loadingAccess: 'rear_and_side',
    name: 'RTE-6K89 Sprinter, 24 paradas',
    payloadRatio: '0.9789',
    rows: SPRINTER_24_STOPS,
  },
  {
    bed: { heightM: '2.300', lengthM: '7.400', source: 'measured', widthM: '2.470' },
    loadingAccess: 'rear',
    name: 'RTA-2F45 Atego, 85 paradas',
    payloadRatio: '0.9897',
    rows: ATEGO_85_STOPS,
  },
  {
    bed: { heightM: '2.200', lengthM: '5.320', source: 'reference', widthM: '2.080' },
    loadingAccess: 'rear',
    name: 'RTD-5J78 Accelo, 24 paradas',
    payloadRatio: '0.6144',
    rows: ACCELO_24_STOPS,
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

function bedOf(load: RealLoad): UnloadingBed {
  return {
    heightM: Number(load.bed.heightM),
    lengthM: Number(load.bed.lengthM),
    widthM: Number(load.bed.widthM),
  }
}

function place(load: RealLoad): CargoPlacement {
  const plan = resolveCargoPlacement({
    bed: load.bed,
    boxes: toBoxes(load.rows),
    loadingAccess: load.loadingAccess,
    payloadRatio: load.payloadRatio,
  })
  if (plan === null) throw new Error('a planta devia existir com o baú medido')

  return plan
}

/** Uma planta montada à mão, caixa por caixa, para afirmar o que a simulação reprova e aprova. */
function handBuilt(
  boxes: readonly Omit<
    PlacedBox,
    'documentId' | 'documentNumber' | 'isFragile' | 'label' | 'layer' | 'reasons' | 'source'
  >[],
): CargoPlacement {
  return {
    layers: [
      {
        boxes: boxes.map((box) => ({
          ...box,
          documentId: null,
          documentNumber: null,
          isFragile: false,
          label: `P${String(box.stopSequence)}`,
          layer: Math.round(box.zM / box.heightM),
          reasons: ['lastStopFirst'],
          source: 'measured',
        })),
        heightM: 0.3,
        index: 0,
      },
    ],
    source: 'measured',
    unplaced: [],
  }
}

const CUBE_M = 0.3

/** Fileiras de cubos de 30 cm: `layers` camadas de pé em `[xM, xM + 0,3] × [fromYM, toYM]`. */
function row(
  input: Readonly<{
    fromYM: number
    layers: number
    stopSequence: number
    toYM: number
    xM: number
  }>,
) {
  const columns = Math.round((input.toYM - input.fromYM) / CUBE_M)
  return Array.from({ length: columns * input.layers }, (_, index) => ({
    depthM: CUBE_M,
    heightM: CUBE_M,
    stopSequence: input.stopSequence,
    widthM: CUBE_M,
    xM: input.xM,
    yM: input.fromYM + (index % columns) * CUBE_M,
    zM: Math.floor(index / columns) * CUBE_M,
  }))
}

/**
 * Uma fatia em degrau do comprimento `[fromXM, toXM]`: a fileira da porta com três camadas (0,90 m, o
 * teto da coluna livre de uma base de 30 cm) e as de trás com seis, seguras pela da frente.
 */
function steppedBlock(
  input: Readonly<{
    fromXM: number
    fromYM: number
    stopSequence: number
    toXM: number
    toYM: number
  }>,
) {
  const rows = Math.round((input.toXM - input.fromXM) / CUBE_M)
  return Array.from({ length: rows }, (_, index) =>
    row({
      fromYM: input.fromYM,
      layers: index === rows - 1 ? 3 : 6,
      stopSequence: input.stopSequence,
      toYM: input.toYM,
      xM: input.fromXM + index * CUBE_M,
    }),
  ).flat()
}

const SYNTHETIC_BED: UnloadingBed = { heightM: 2, lengthM: 3, widthM: 1.8 }

describe('a descarga entrega por entrega (spec 118)', () => {
  test('a grade de faixas finas reprova: a faixa que esvazia deixa a vizinha sem parede', () => {
    const lanes = handBuilt(
      [1, 2, 3].flatMap((stopSequence) =>
        steppedBlock({
          fromXM: 0,
          fromYM: (stopSequence - 1) * 0.6,
          stopSequence,
          toXM: 3,
          toYM: stopSequence * 0.6,
        }),
      ),
    )
    const report = simulateUnloading(lanes, SYNTHETIC_BED)

    /** Com a carga inteira cada faixa encosta na vizinha; é a saída da primeira que solta a segunda. */
    expect(report.unsupported.length).toBeGreaterThan(0)
    expect(report.unsupported.every((entry) => entry.step >= 1)).toBe(true)
  })

  test('paredes inteiras, uma entrega atrás da outra, passam', () => {
    const walls = handBuilt([
      ...steppedBlock({ fromXM: 0, fromYM: 0, stopSequence: 3, toXM: 0.9, toYM: 1.8 }),
      ...steppedBlock({ fromXM: 0.9, fromYM: 0, stopSequence: 2, toXM: 1.8, toYM: 1.8 }),
      ...steppedBlock({ fromXM: 1.8, fromYM: 0, stopSequence: 1, toXM: 2.7, toYM: 1.8 }),
    ])

    expect(simulateUnloading(walls, SYNTHETIC_BED)).toEqual({ stuck: [], unsupported: [] })
  })

  test('a entrega mais cedo em cima de uma posterior, funda demais para a mão, trava', () => {
    const plan = handBuilt([
      ...row({ fromYM: 0, layers: 3, stopSequence: 2, toYM: 1.8, xM: 1.2 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 2, toYM: 1.8, xM: 1.5 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 2, toYM: 1.8, xM: 1.8 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 2, toYM: 1.8, xM: 2.1 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 2, toYM: 1.8, xM: 2.4 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 2, toYM: 1.8, xM: 2.7 }),
      {
        depthM: CUBE_M,
        heightM: CUBE_M,
        stopSequence: 1,
        widthM: CUBE_M,
        xM: 1.2,
        yM: 0.6,
        zM: 0.9,
      },
    ])

    expect(simulateUnloading(plan, SYNTHETIC_BED).stuck).toEqual([
      { count: 1, stopSequence: 1, total: 1 },
    ])
  })

  /**
   * ⚠️ Spec 133: **a caixa não é vizinha dela mesma.** O juiz carimbava a caixa pelo centro da célula de
   * 1 cm e a primeira sonda ficava a 0,5 mm da face: com a face depois do centro da célula, a sonda caía
   * na célula da própria caixa, e a fileira do fundo do Accelo — a 0,474 m da testeira, com giro de
   * 0,285 m — passava escorada nela mesma. A fileira do fundo desta planta está a 0,474 m da testeira.
   */
  test('a fileira do fundo, longe da testeira, não se escora nela mesma', () => {
    const plan = handBuilt([
      ...row({ fromYM: 0, layers: 4, stopSequence: 1, toYM: 1.8, xM: 0.474 }),
      ...row({ fromYM: 0, layers: 4, stopSequence: 1, toYM: 1.8, xM: 0.774 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 1, toYM: 1.8, xM: 1.074 }),
    ])
    const unsupported = simulateUnloading(plan, SYNTHETIC_BED).unsupported

    /** Só a camada acima de três bases, e só na fileira que não tem nada atrás dela. */
    expect(unsupported.length).toBe(6)
    expect(
      unsupported.every(
        ({ box }) => Math.abs(box.xM - 0.474) < 1e-9 && Math.abs(box.zM - 0.9) < 1e-9,
      ),
    ).toBe(true)
  })

  test('a mesma fileira dentro do giro da pilha é escorada pela testeira', () => {
    const plan = handBuilt([
      ...row({ fromYM: 0, layers: 4, stopSequence: 1, toYM: 1.8, xM: 0.2 }),
      ...row({ fromYM: 0, layers: 4, stopSequence: 1, toYM: 1.8, xM: 0.5 }),
      ...row({ fromYM: 0, layers: 3, stopSequence: 1, toYM: 1.8, xM: 0.8 }),
    ])

    expect(simulateUnloading(plan, SYNTHETIC_BED).unsupported).toEqual([])
  })

  /**
   * ⚠️ Spec 133: o vazio não escora. A grade devolvia altura zero na célula vazia, e a caixa no piso cuja
   * contenção começa em zero passava escorada por ar. Uma caixa só, alta e fina, no meio do baú.
   */
  test('a caixa alta e fina, sozinha no piso, não se escora no vazio', () => {
    const plan = handBuilt([
      { depthM: 0.1, heightM: 0.5, stopSequence: 1, widthM: 0.1, xM: 1.2, yM: 0.8, zM: 0 },
    ])

    expect(simulateUnloading(plan, SYNTHETIC_BED).unsupported.length).toBe(1)
  })

  /** A viagem da spec 100 (Fiorino, três paradas lado a lado): a faixa também tem de aguentar a descarga. */
  test('as faixas de uma parada cada, na Fiorino, passam', () => {
    const bed = { heightM: '1.300', lengthM: '1.700', source: 'measured' as const, widthM: '1.450' }
    const plan = resolveCargoPlacement({
      bed,
      boxes: toBoxes([
        [1, 6, 400, 300, 300, 1],
        [2, 8, 400, 300, 300, 1],
        [3, 17, 400, 300, 300, 1],
      ]),
      payloadRatio: null,
    })
    if (plan === null) throw new Error('a planta devia existir com o baú medido')

    expect(simulateUnloading(plan, { heightM: 1.3, lengthM: 1.7, widthM: 1.45 })).toEqual({
      stuck: [],
      unsupported: [],
    })
  })

  for (const load of REAL_LOADS) {
    /**
     * ⚠️ Spec 133/134: com o juiz corrigido a Sprinter e o Accelo tinham a fileira do fundo solta (15 e
     * 15), afastada da testeira pelo deslocamento para a porta. A 134 encosta a carga na cabeceira, e a
     * afirmação volta a ser zero.
     */
    test(`${load.name}: nenhuma caixa perde apoio enquanto as entregas anteriores saem`, () => {
      const unsupported = simulateUnloading(place(load), bedOf(load)).unsupported

      expect(
        unsupported.map(({ box, step }) => `P${String(box.stopSequence)} passo ${String(step)}`),
      ).toEqual([])
    })

    /**
     * ⚠️ Spec 120: a afirmação vale para o **mapa recomendado**. A caixa do complemento é, por definição,
     * a que passou da mão (`outOfReach`) ou fura a ordem (`needsRehandling`) — ela trava na simulação e
     * diz isso na própria caixa. Que ela não prenda caixa recomendada é `complement.contract.ts`.
     */
    test(`${load.name}: toda entrega do mapa recomendado sai de pé no piso, sem corredor estreito`, () => {
      const plan = place(load)
      const recommended = {
        ...plan,
        layers: plan.layers.map((layer) => ({
          ...layer,
          boxes: layer.boxes.filter((box) => !isComplementBox(box)),
        })),
      }

      expect(simulateUnloading(recommended, bedOf(load)).stuck).toEqual([])
    })
  }
})
