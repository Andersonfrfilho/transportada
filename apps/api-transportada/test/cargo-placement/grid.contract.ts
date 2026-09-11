/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  resolveGridLanes,
  resolveStopArrangement,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/** O baú da ACCELO 1016 da proposta real (referência `three_quarter`/`02`). */
const BED = { heightM: '2.200', lengthM: '5.320', source: 'measured' as const, widthM: '2.080' }

function stop(stopSequence: number, count = 10): PlacementBox {
  return {
    count,
    heightMm: 250,
    isFragile: false,
    isStackable: true,
    keepUpright: false,
    label: `Parada ${stopSequence}`,
    lengthMm: 400,
    maxStackCount: null,
    source: 'measured',
    stopSequence,
    widthMm: 300,
  }
}

const TWENTY_FOUR = Array.from({ length: 24 }, (_, index) => stop(index + 1))

function placedStops(boxes: readonly PlacementBox[], payloadRatio: string | null = null) {
  const placement = resolveCargoPlacement({ bed: BED, boxes, payloadRatio })
  return (placement?.layers ?? []).flatMap((layer) => layer.boxes)
}

/**
 * Spec 113: a grade. Medido em 2026-09-10 numa proposta real de 24 entregas: paradas uma atrás da
 * outra, e 16 de 24 fora do desenho com o baú em 50%.
 */
describe('a grade de carga (spec 113)', () => {
  test('vinte e quatro paradas que não cabem em faixas saem em grade', () => {
    const decision = resolveStopArrangement({ bed: BED, boxes: TWENTY_FOUR, payloadRatio: null })
    /** Spec 115: a decisão passou a levar as faixas que empacotou (`laneCount`) — daí o `toMatchObject`. */
    expect(decision).toMatchObject({ arrangement: 'grid', reason: 'tooWide' })

    const grid = resolveGridLanes({
      bedHeightM: 2.2,
      bedLengthM: 5.32,
      bedWidthM: 2.08,
      boxes: TWENTY_FOUR,
    })
    expect(grid?.laneCount).toBeGreaterThanOrEqual(2)
    expect(grid?.laneCount).toBeLessThan(24)
  })

  /** A grade equilibra dentro de cada faixa: o peso acima de metade do teto não a derruba. */
  test('acima de metade do teto a viagem grande continua em grade', () => {
    const decision = resolveStopArrangement({ bed: BED, boxes: TWENTY_FOUR, payloadRatio: '0.58' })
    expect(decision).toMatchObject({ arrangement: 'grid', reason: 'weight' })
  })

  /** ⚠️ O ponto da spec: com o baú tendo espaço, nenhuma parada fica fora do desenho. */
  test('nenhuma parada fica fora do desenho com o baú tendo espaço', () => {
    for (const payloadRatio of [null, '0.58']) {
      const stops = new Set(placedStops(TWENTY_FOUR, payloadRatio).map((box) => box.stopSequence))
      expect(stops.size).toBe(24)
    }
  })

  /**
   * As faixas que o desenho usa são as da **decisão** (`laneCount`), não a grade mais larga que o volume
   * admite: a spec 115 fica com a maior grade que coloca tudo.
   *
   * ⚠️ Spec 135: com a escora pela face (a caixa de baixo não escora a de cima pelo lado), a grade de 3
   * faixas destas 24 paradas coloca 236 de 240 caixas e a de 2 coloca 240 — a decisão passou a 2. O
   * contrato comparava com a grade de 3, que já não é a desenhada.
   */
  function drawnGrid() {
    const decision = resolveStopArrangement({ bed: BED, boxes: TWENTY_FOUR, payloadRatio: null })
    const grid = resolveGridLanes({
      bedHeightM: 2.2,
      bedLengthM: 5.32,
      bedWidthM: 2.08,
      boxes: TWENTY_FOUR,
      ...(decision.laneCount === undefined ? {} : { maxLanes: decision.laneCount }),
    })
    return { decision, grid }
  }

  /**
   * A primeira entrega de cada faixa fica na frente da própria faixa — nada da faixa entre ela e a porta.
   *
   * ⚠️ Spec 135: "encostam na porta, lado a lado" deixou de valer por causa da spec 134 — o bloco fica
   * encostado na cabeceira quando a testeira escora a pilha, e com 2 faixas as duas têm comprimentos
   * diferentes (medido: frente em 3,874 e 4,674 m). O que a descarga pede é a primeira entrega de cada
   * faixa na frente dela, e é isso que se afirma.
   */
  test('a primeira entrega de cada faixa fica na frente da própria faixa', () => {
    const { decision, grid } = drawnGrid()
    expect(decision.arrangement).toBe('grid')
    const boxes = placedStops(TWENTY_FOUR)
    for (let lane = 0; lane < (grid?.laneCount ?? 0); lane += 1) {
      const own = boxes.filter((box) => grid?.laneOf.get(box.stopSequence) === lane)
      const first = Math.min(...own.map((box) => box.stopSequence))
      const frontM = Math.max(...own.map((box) => box.xM + box.depthM))
      const firstFrontM = Math.max(
        ...own.filter((box) => box.stopSequence === first).map((box) => box.xM + box.depthM),
      )
      expect(firstFrontM).toBeCloseTo(frontM, 6)
    }
  })

  test('uma faixa nunca invade a outra', () => {
    const { grid } = drawnGrid()
    const laneWidthM = grid?.laneWidthM ?? 0
    expect(laneWidthM).toBeGreaterThan(0)
    for (const box of placedStops(TWENTY_FOUR)) {
      const lane = grid?.laneOf.get(box.stopSequence) ?? 0
      expect(box.yM).toBeGreaterThanOrEqual(lane * laneWidthM - 0.001)
      expect(box.yM + box.widthM).toBeLessThanOrEqual((lane + 1) * laneWidthM + 0.001)
    }
  })

  /** Com uma parada por faixa a grade é a faixa da spec 100, que tem regra própria. */
  test('não vira grade sem mais paradas que faixas', () => {
    expect(
      resolveGridLanes({ bedHeightM: 2.2, bedLengthM: 5.32, bedWidthM: 2.08, boxes: [stop(1)] }),
    ).toBeNull()
  })
})
