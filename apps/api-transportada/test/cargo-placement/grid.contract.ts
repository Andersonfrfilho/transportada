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

  /** As primeiras entregas — uma por faixa — encostam na porta, lado a lado. */
  test('as primeiras entregas ficam todas na porta', () => {
    const grid = resolveGridLanes({
      bedHeightM: 2.2,
      bedLengthM: 5.32,
      bedWidthM: 2.08,
      boxes: TWENTY_FOUR,
    })
    const boxes = placedStops(TWENTY_FOUR)
    const doorM = Math.max(...boxes.map((box) => box.xM + box.depthM))
    for (let stopSequence = 1; stopSequence <= (grid?.laneCount ?? 0); stopSequence += 1) {
      const own = boxes.filter((box) => box.stopSequence === stopSequence)
      expect(Math.max(...own.map((box) => box.xM + box.depthM))).toBeCloseTo(doorM, 1)
    }
  })

  test('uma faixa nunca invade a outra', () => {
    const grid = resolveGridLanes({
      bedHeightM: 2.2,
      bedLengthM: 5.32,
      bedWidthM: 2.08,
      boxes: TWENTY_FOUR,
    })
    const laneWidthM = grid?.laneWidthM ?? 0
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
