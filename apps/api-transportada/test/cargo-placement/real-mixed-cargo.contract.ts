/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  MAX_DRAWN_BOXES,
  resolveCargoPlacement,
  STABLE_STACK_SLENDERNESS,
  type CargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'
import {
  ACCELO_24_STOPS,
  ATEGO_85_STOPS,
  type RealCargoRow,
} from '../fixtures/real-mixed-cargo.fixture.js'

/**
 * Spec 115: as invariantes da planta conferidas em **duas cargas reais**, com tamanhos misturados — a
 * caixa presumida de 0,371 × 0,261 × 0,21 m ao lado das medidas com fita.
 *
 * ⚠️ As afirmações são de **propriedade** — dentro do baú, nada atravessa nada, nada no ar, a ordem de
 * descarga vale, ninguém some —, nunca a posição de uma caixa. Reconstruir a decisão mediria o
 * desempate, não a regra. E a lição da 114 continua: contrato sintético confirma a implementação, e
 * foi a carga real que mostrou os três defeitos que isto trava.
 */
const EPSILON = 1e-6
/** Altura de apoio: o `z` publicado é arredondado ao milímetro. */
const SEAT_TOLERANCE_M = 1e-3

type RealLoad = Readonly<{
  bed: Readonly<{
    heightM: string
    lengthM: string
    source: 'measured' | 'reference'
    widthM: string
  }>
  payloadRatio: string
  rows: readonly RealCargoRow[]
}>

const ACCELO: RealLoad = {
  bed: { heightM: '2.200', lengthM: '5.320', source: 'reference', widthM: '2.080' },
  payloadRatio: '0.6144',
  rows: ACCELO_24_STOPS,
}
const ATEGO: RealLoad = {
  bed: { heightM: '2.300', lengthM: '7.400', source: 'measured', widthM: '2.470' },
  payloadRatio: '0.9897',
  rows: ATEGO_85_STOPS,
}

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
    payloadRatio: load.payloadRatio,
  })
  if (plan === null) throw new Error('a planta devia existir com o baú medido')

  return plan
}

function drawnOf(plan: CargoPlacement): PlacedBox[] {
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

/** O topo mais alto sob a pegada inteira — é onde a caixa tem de estar sentada. */
function supportUnder(box: PlacedBox, boxes: readonly PlacedBox[]): number {
  return boxes.reduce((highest, other) => {
    if (other === box || !sharesFootprint(box, other)) return highest
    const top = other.zM + other.heightM
    return top <= box.zM + SEAT_TOLERANCE_M ? Math.max(highest, top) : highest
  }, 0)
}

function countBreaks(plan: CargoPlacement, bed: RealLoad['bed']): Record<string, number> {
  const [lengthM, widthM, heightM] = [bed.lengthM, bed.widthM, bed.heightM].map(Number)
  const boxes = drawnOf(plan)
  const breaks = { crossing: 0, floating: 0, laterAbove: 0, laterTowardDoor: 0, outside: 0 }

  for (const [index, box] of boxes.entries()) {
    if (
      box.xM < -EPSILON ||
      box.yM < -EPSILON ||
      box.zM < -EPSILON ||
      box.xM + box.depthM > (lengthM ?? 0) + EPSILON ||
      box.yM + box.widthM > (widthM ?? 0) + EPSILON ||
      box.zM + box.heightM > (heightM ?? 0) + EPSILON
    ) {
      breaks.outside += 1
    }
    if (Math.abs(box.zM - supportUnder(box, boxes)) > SEAT_TOLERANCE_M) breaks.floating += 1
    for (const other of boxes.slice(index + 1)) {
      if (sharesFootprint(box, other) && overlaps(box.zM, box.heightM, other.zM, other.heightM)) {
        breaks.crossing += 1
      }
    }
    for (const later of boxes) {
      if (later.stopSequence <= box.stopSequence) continue
      if (sharesFootprint(box, later) && later.zM >= box.zM + box.heightM - EPSILON) {
        breaks.laterAbove += 1
      }
      if (
        overlaps(box.yM, box.widthM, later.yM, later.widthM) &&
        overlaps(box.zM, box.heightM, later.zM, later.heightM) &&
        later.xM >= box.xM + box.depthM - EPSILON
      ) {
        breaks.laterTowardDoor += 1
      }
    }
  }

  return breaks
}

const NO_BREAKS = { crossing: 0, floating: 0, laterAbove: 0, laterTowardDoor: 0, outside: 0 }

describe('cargas reais de tamanhos misturados (spec 115)', () => {
  /**
   * ⚠️ Era o defeito aberto da 114: 49 caixas `bedFull` com o baú a 38%. Duas causas, as duas
   * medidas — a coluna livre contada do piso, que descia a carga em escada por 2,9 m até a porta, e a
   * grade de seis faixas em que o rodízio sobrecarregava uma delas.
   */
  test('a carga de 24 paradas a 41% do baú entra inteira', () => {
    const plan = place(ACCELO)
    const drawnStops = new Set(drawnOf(plan).map((box) => box.stopSequence))

    expect(plan.unplaced).toEqual([])
    expect(drawnStops.size).toBe(new Set(ACCELO.rows.map(([stop]) => stop)).size)
  })

  test('nas duas cargas, nada sai do baú, atravessa outra caixa, fica no ar ou fura a ordem', () => {
    for (const load of [ACCELO, ATEGO]) {
      expect(countBreaks(place(load), load.bed)).toEqual(NO_BREAKS)
    }
  })

  /**
   * ⚠️ O teto cortava o **empacotamento**, e a carga é empacotada da última entrega para a primeira:
   * as 817 caixas fora eram justamente as que saem primeiro, e 48 paradas sumiam por "limite de
   * detalhe". O teto agora é de desenho, e 1417 caixas cabem nele.
   */
  test('nenhuma caixa do Atego de 85 paradas fica fora por limite de detalhe', () => {
    const plan = place(ATEGO)

    expect(plan.unplaced.filter((entry) => entry.reason === 'tooMany')).toEqual([])
    expect(drawnOf(plan).length).toBeGreaterThan(600)
  })

  /**
   * ⚠️ Spec 116: 435 caixas saíam `bedFull` com o baú a 48%, e 24 paradas (13–16, 21–40) sumiam do
   * desenho. Duas causas medidas: a busca de lugar desistia depois de 64 fileiras — num baú de 7,40 m
   * ela recomeça da testeira a cada fronteira nova — e a memória de formato recusava as 431 gêmeas sem
   * procurar; e o vão de 7 cm até a parede lateral contava como face solta. Medido depois: 1282 de 1417
   * caixas, e o que ainda sai é das primeiras entregas, na porta, onde a pilha só sobe três vezes a base.
   *
   * ⚠️ Spec 117: o piso subiu de 1250 caixas e 8 paradas fora para o que a porta explica. Das 135 que
   * saíam, 65 eram desarrumação — caixa medida pequena sentando no meio da fileira e deslocando as
   * presumidas meia caixa, que tirava o apoio das colunas de trás e fazia pirâmide. Com a caixa pequena
   * indo para o espaço onde a presumida não cabe: 1347 de 1417, e sobre a planta final só desligar a
   * esbeltez da porta colocaria mais caixa (73, todas a menos de 1,3 m dela). O que sobra é a escada da
   * porta: 7 + 4 + 1 camadas a menos, de 8 caixas cada.
   *
   * ⚠️ Spec 118: o piso desceu de 1340 caixas e 4 paradas para 1185 e 14, e a razão é a descarga. Sem a
   * regra do alcance as entregas 1 a 60 subiam em cima das posteriores e **490 caixas** só saíam
   * subindo na carga. Com a entrega mais cedo presa ao alcance da mão, o degrau da porta de cada
   * entrega não é mais enchido pelas seguintes lá no alto: medido, 1190 de 1417 caixas e as paradas
   * 1, 3–5 e 7–16 fora. O que sai continua sendo só das primeiras entregas.
   */
  test('o Atego de 85 paradas desenha quase tudo, e só as primeiras entregas ficam fora', () => {
    const plan = place(ATEGO)
    const drawnStops = new Set(drawnOf(plan).map((box) => box.stopSequence))
    const missing = [...new Set(ATEGO.rows.map(([stop]) => stop))].filter(
      (stop) => !drawnStops.has(stop),
    )

    expect(drawnOf(plan).length).toBeGreaterThanOrEqual(1185)
    expect(missing.length).toBeLessThanOrEqual(14)
    for (const stop of missing) expect(stop).toBeLessThanOrEqual(16)
  })

  test('o Atego de 1417 caixas cabe no orçamento de 50 ms', () => {
    place(ATEGO)
    const startedAt = performance.now()
    place(ATEGO)

    expect(performance.now() - startedAt).toBeLessThan(50)
  })

  /**
   * ⚠️ A porta continua não sendo parede: a caixa sem nada à frente dela, do lado da porta, só sobe
   * até três vezes a base contada do piso. A contenção relaxou a trava **atrás** da fileira da porta,
   * nunca nela.
   */
  test('a pilha sem nada à frente não passa de três vezes a base', () => {
    for (const load of [ACCELO, ATEGO]) {
      const boxes = drawnOf(place(load))
      const exposed = boxes.filter(
        (box) =>
          !boxes.some(
            (other) =>
              other !== box &&
              overlaps(box.yM, box.widthM, other.yM, other.widthM) &&
              other.xM >= box.xM + box.depthM - EPSILON,
          ),
      )

      expect(exposed.length).toBeGreaterThan(0)
      for (const box of exposed) {
        expect(box.zM + box.heightM).toBeLessThanOrEqual(
          Math.min(box.depthM, box.widthM) * STABLE_STACK_SLENDERNESS + EPSILON,
        )
      }
    }
  })

  /**
   * ⚠️ Acima do teto de desenho sai primeiro a caixa de cima: tirar pela ordem de carregamento
   * apagava paradas inteiras, e tirar do meio deixaria caixa desenhada sobre um vão.
   */
  test('o teto de desenho nunca apaga uma parada nem deixa caixa no ar', () => {
    const boxes = Array.from({ length: 85 }, (_, index) => ({
      ...toBoxes([[index + 1, 24, 150, 150, 150, 1]])[0],
    })) as PlacementBox[]
    const plan = resolveCargoPlacement({ bed: ATEGO.bed, boxes, payloadRatio: null })
    const drawn = plan === null ? [] : drawnOf(plan)

    expect(drawn.length).toBeLessThanOrEqual(MAX_DRAWN_BOXES)
    expect(plan?.unplaced.some((entry) => entry.reason === 'tooMany')).toBe(true)
    expect(new Set(drawn.map((box) => box.stopSequence)).size).toBe(85)
    expect(
      drawn.filter((box) => Math.abs(box.zM - supportUnder(box, drawn)) > SEAT_TOLERANCE_M),
    ).toEqual([])
  })
})
