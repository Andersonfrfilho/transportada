/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { LoadingAccess } from '../../src/shared/loading-access.constant.js'
import {
  isComplementBox,
  resolveCargoPlacement,
  resolveSplitNotes,
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
import { knownUnsupportedOf } from './known-unsupported.js'
import { simulateUnloading, type UnloadingBed } from './unloading-simulation.js'

/**
 * Spec 120: **se tem espaço, a carga entra** — primeiro pelo mapa recomendado (todas as regras, a 118
 * inclusive), depois pelo complemento, que afrouxa só conveniência: a mão de quem descarrega
 * (`outOfReach`) e, por último, a ordem de descarga (`needsRehandling`).
 *
 * ⚠️ As afirmações são de **propriedade** — quantas entram, quem trava, quem perde apoio —, nunca a
 * posição de uma caixa. A física não afrouxa: dentro do baú, nada atravessando nada, nada no ar, pilha de
 * pé no carregamento e em cada passo da descarga.
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
  /** Quantas caixas o empacotador anterior à spec 118 desenhava (`f126792f`), sem a regra da mão. */
  pre118Drawn: number
  rows: readonly RealCargoRow[]
}>

const REAL_LOADS: readonly RealLoad[] = [
  {
    bed: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
    loadingAccess: 'rear',
    name: 'RTC-4H67 Daily, 19 paradas',
    payloadRatio: '0.9007',
    pre118Drawn: 481,
    rows: DAILY_19_STOPS,
  },
  {
    bed: { heightM: '1.900', lengthM: '3.400', source: 'measured', widthM: '1.780' },
    loadingAccess: 'rear_and_side',
    name: 'RTE-6K89 Sprinter, 24 paradas',
    payloadRatio: '0.9789',
    pre118Drawn: 252,
    rows: SPRINTER_24_STOPS,
  },
  {
    bed: { heightM: '2.300', lengthM: '7.400', source: 'measured', widthM: '2.470' },
    loadingAccess: 'rear',
    name: 'RTA-2F45 Atego, 85 paradas',
    payloadRatio: '0.9897',
    pre118Drawn: 1347,
    rows: ATEGO_85_STOPS,
  },
  {
    bed: { heightM: '2.200', lengthM: '5.320', source: 'reference', widthM: '2.080' },
    loadingAccess: 'rear',
    name: 'RTD-5J78 Accelo, 24 paradas',
    payloadRatio: '0.6144',
    pre118Drawn: 500,
    rows: ACCELO_24_STOPS,
  },
]

const EPSILON = 1e-6
const SEAT_TOLERANCE_M = 1e-3

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

function drawnOf(plan: CargoPlacement): PlacedBox[] {
  return plan.layers.flatMap((layer) => layer.boxes)
}

function onlyRecommended(plan: CargoPlacement): CargoPlacement {
  return {
    ...plan,
    layers: plan.layers.map((layer) => ({
      ...layer,
      boxes: layer.boxes.filter((box) => !isComplementBox(box)),
    })),
  }
}

function bedOf(load: RealLoad): UnloadingBed {
  return {
    heightM: Number(load.bed.heightM),
    lengthM: Number(load.bed.lengthM),
    widthM: Number(load.bed.widthM),
  }
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

/** Entrega mais tardia em cima de uma mais cedo, ou entre ela e a porta (spec 114 D4). */
function breaksOrder(earlier: PlacedBox, later: PlacedBox): boolean {
  if (later.stopSequence <= earlier.stopSequence) return false
  return (
    (sharesFootprint(earlier, later) && later.zM >= earlier.zM + earlier.heightM - EPSILON) ||
    (overlaps(earlier.yM, earlier.widthM, later.yM, later.widthM) &&
      overlaps(earlier.zM, earlier.heightM, later.zM, later.heightM) &&
      later.xM >= earlier.xM + earlier.depthM - EPSILON)
  )
}

function physicalBreaks(plan: CargoPlacement, bed: UnloadingBed): Record<string, number> {
  const boxes = drawnOf(plan)
  const breaks = { crossing: 0, floating: 0, outside: 0 }
  for (const [index, box] of boxes.entries()) {
    if (
      box.xM < -EPSILON ||
      box.yM < -EPSILON ||
      box.zM < -EPSILON ||
      box.xM + box.depthM > bed.lengthM + EPSILON ||
      box.yM + box.widthM > bed.widthM + EPSILON ||
      box.zM + box.heightM > bed.heightM + EPSILON
    ) {
      breaks.outside += 1
    }
    const support = boxes.reduce((highest, other) => {
      if (other === box || !sharesFootprint(box, other)) return highest
      const top = other.zM + other.heightM
      return top <= box.zM + SEAT_TOLERANCE_M ? Math.max(highest, top) : highest
    }, 0)
    if (Math.abs(box.zM - support) > SEAT_TOLERANCE_M) breaks.floating += 1
    for (const other of boxes.slice(index + 1)) {
      if (sharesFootprint(box, other) && overlaps(box.zM, box.heightM, other.zM, other.heightM)) {
        breaks.crossing += 1
      }
    }
  }

  return breaks
}

describe('o mapa recomendado e o complemento (spec 120)', () => {
  /**
   * ⚠️ A Daily deixava 40 caixas `bedFull` com o baú a 57%: as entregas 1 a 3 não cabiam ao alcance da
   * mão (spec 118). Com o complemento as três viagens voltam ao que o empacotador anterior à 118
   * desenhava — todas as caixas pedidas.
   */
  test('Daily, Sprinter e Accelo desenham toda caixa pedida', () => {
    for (const load of REAL_LOADS.filter((entry) => entry.name.includes('Atego') === false)) {
      const plan = place(load)

      expect(plan.unplaced).toEqual([])
      expect(drawnOf(plan).length).toBeGreaterThanOrEqual(load.pre118Drawn)
    }
  })

  /**
   * ⚠️ **No Atego o que fica fora não cabe de pé.** Medido: recomendado 1190 + complemento 79 = 1269 de
   * 1417, e as 148 que sobram só entrariam derrubando a pilha — sem a esbeltez no complemento entravam
   * 198, com 74 caixas sem apoio. Os 1347 de antes da 118 eram outra arrumação inteira (as entregas
   * mais cedo subindo nas paredes das posteriores, fora da mão), e o complemento não desfaz o mapa
   * recomendado para recuperá-la: ele só usa o espaço que sobrou nele.
   */
  test('o Atego desenha o recomendado inteiro e o complemento que fica de pé', () => {
    const load = REAL_LOADS.find((entry) => entry.name.includes('Atego'))
    if (load === undefined) throw new Error('o Atego está no fixture')
    const plan = place(load)
    const drawn = drawnOf(plan)

    expect(drawn.filter((box) => !isComplementBox(box)).length).toBeGreaterThanOrEqual(1185)
    expect(drawn.length).toBeGreaterThanOrEqual(1265)
    expect(plan.unplaced.every((entry) => entry.reason === 'bedFull')).toBe(true)
  })

  for (const load of REAL_LOADS) {
    test(`${load.name}: o mapa recomendado sozinho cumpre a spec 118`, () => {
      const recommended = onlyRecommended(place(load))
      const boxes = drawnOf(recommended)

      const report = simulateUnloading(recommended, bedOf(load))

      expect(report.stuck).toEqual([])
      /** ⚠️ Spec 133: não piorar a linha de base do juiz corrigido até a spec 134 zerá-la. */
      expect(report.unsupported.length).toBeLessThanOrEqual(knownUnsupportedOf(load.name))
      expect(boxes.flatMap((box) => boxes.filter((other) => breaksOrder(box, other)))).toEqual([])
    })

    test(`${load.name}: o complemento não quebra física, e ninguém perde apoio na descarga`, () => {
      const plan = place(load)

      expect(physicalBreaks(plan, bedOf(load))).toEqual({ crossing: 0, floating: 0, outside: 0 })
      expect(simulateUnloading(plan, bedOf(load)).unsupported.length).toBeLessThanOrEqual(
        knownUnsupportedOf(load.name),
      )
    })

    /**
     * ⚠️ A caixa do complemento nunca pousa em cima de caixa recomendada da própria entrega: a de baixo
     * ficaria presa até alguém alcançar a de cima. Com o complemento no baú, só ele trava.
     */
    test(`${load.name}: com o complemento no baú, só a caixa dele trava na descarga`, () => {
      const plan = place(load)
      const complementByStop = new Map<number, number>()
      for (const box of drawnOf(plan).filter(isComplementBox)) {
        complementByStop.set(box.stopSequence, (complementByStop.get(box.stopSequence) ?? 0) + 1)
      }

      for (const entry of simulateUnloading(plan, bedOf(load)).stuck) {
        expect(entry.count).toBeLessThanOrEqual(complementByStop.get(entry.stopSequence) ?? 0)
      }
    })

    /** Só `needsRehandling` fura a ordem de descarga — é o nome dele. */
    test(`${load.name}: a ordem só é furada por caixa marcada para remanejar`, () => {
      const boxes = drawnOf(place(load))
      const broken = boxes.flatMap((box) =>
        boxes.filter((other) => breaksOrder(box, other)).map((other) => [box, other] as const),
      )

      for (const [earlier, later] of broken) {
        expect(
          earlier.reasons.includes('needsRehandling') || later.reasons.includes('needsRehandling'),
        ).toBe(true)
      }
    })
  }
})

function noteBox(
  input: Readonly<{ documentId: string; xM: number; yM?: number; zM?: number }>,
): PlacedBox {
  return {
    depthM: 0.261,
    documentId: input.documentId,
    documentNumber: null,
    heightM: 0.21,
    isFragile: false,
    label: 'P1',
    layer: 0,
    reasons: ['lastStopFirst'],
    source: 'estimated',
    stopSequence: 1,
    widthM: 0.371,
    xM: input.xM,
    yM: input.yM ?? 0,
    zM: input.zM ?? 0,
  }
}

describe('a nota inteira junta (spec 120)', () => {
  /**
   * **Pedaço** é um grupo de caixas da mesma nota ligadas por contato de face. ⚠️ O vão de uma célula
   * (5 cm) ainda é contato: a presumida de 0,261 m ocupa 0,30 m de célula, e duas vizinhas ficam a
   * 3,9 cm uma da outra no desenho — encostadas no baú.
   */
  test('conta pedaços por contato de face, com o vão da célula', () => {
    const touching = [noteBox({ documentId: 'a', xM: 0 }), noteBox({ documentId: 'a', xM: 0.3 })]
    const stacked = [
      noteBox({ documentId: 'b', xM: 0 }),
      noteBox({ documentId: 'b', xM: 0, zM: 0.21 }),
    ]
    const apart = [noteBox({ documentId: 'c', xM: 0 }), noteBox({ documentId: 'c', xM: 0.5 })]
    const corner = [
      noteBox({ documentId: 'd', xM: 0 }),
      noteBox({ documentId: 'd', xM: 0.3, yM: 0.4 }),
    ]

    expect(resolveSplitNotes([...touching, ...stacked, ...apart, ...corner])).toEqual([
      { documentId: 'c', pieces: 2 },
      { documentId: 'd', pieces: 2 },
    ])
  })

  test('a nota que cabe inteira no mapa recomendado sai num pedaço só', () => {
    const plan = resolveCargoPlacement({
      bed: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
      boxes: [
        {
          ...toBoxes([[1, 24, 400, 300, 250, 1]])[0],
          documentId: 'nota-unica',
          documentNumber: '1',
        } as PlacementBox,
        ...toBoxes([[2, 24, 400, 300, 250, 1]]),
      ],
      payloadRatio: null,
    })

    expect(plan?.unplaced).toEqual([])
    expect(plan?.splitNotes).toEqual([])
  })

  /** A planta publica a divisão que o desenho mostra — nunca uma conta à parte. */
  test('a divisão publicada é a do desenho', () => {
    const boxes = toBoxes(DAILY_19_STOPS).map((box, index) => ({
      ...box,
      documentId: `nota-${String(box.stopSequence)}-${String(index % 2)}`,
      documentNumber: null,
    }))
    const plan = resolveCargoPlacement({
      bed: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
      boxes,
      loadingAccess: 'rear',
      payloadRatio: '0.9007',
    })
    if (plan === null) throw new Error('a planta devia existir com o baú medido')

    expect(plan.splitNotes).toEqual(resolveSplitNotes(drawnOf(plan)))
    expect((plan.splitNotes ?? []).every((note) => note.pieces > 1)).toBe(true)
  })
})
