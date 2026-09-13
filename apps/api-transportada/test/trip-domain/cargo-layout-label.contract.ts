/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import { relabelCargoLayout } from '../../src/trips/domain/cargo-layout-label.policy.js'
import {
  NEW_INPUT,
  NEW_STOPS,
  OLD_INPUT,
  drawnWith,
  maskLabels,
} from '../fixtures/cargo-layout-label.fixture.js'

function placedBoxesOf(layout: ResolvedCargoLayout) {
  return (layout.placement?.layers ?? []).flatMap((layer) => layer.boxes)
}

/**
 * Spec 145 D20 (T16): a planta `ready` pode ter sido desenhada com a etiqueta de antes — o hash a
 * ignora (D6). A leitura troca só a etiqueta, pela entrada de agora; o desenho fica como o worker o fez.
 */
describe('a etiqueta servida é a de agora (spec 145 D20)', () => {
  const oldLayout = drawnWith(OLD_INPUT)

  test('a planta de antes, reetiquetada, é a que a entrada de agora desenharia', () => {
    expect(relabelCargoLayout(oldLayout, NEW_INPUT)).toEqual(drawnWith(NEW_INPUT))
  })

  test('troca só a etiqueta: com as etiquetas apagadas, a planta é a mesma', () => {
    const relabeled = relabelCargoLayout(oldLayout, NEW_INPUT)

    expect(maskLabels(relabeled)).toEqual(maskLabels(oldLayout))
    expect(relabeled.rows.map((row) => row.clientName)).toContain('Cliente Renomeado')
    expect(relabeled.slices.map((slice) => slice.label)).toContain('Rua Nova, 10')
    expect(relabeled.stopsWithoutVolume).toEqual([{ documentCount: 1, label: 'Rua C, 30' }])
    expect(relabeled.pendingMeasurements.map((item) => item.stopLabel)).toEqual(['Rua Nova, 10'])
  })

  test('a caixa casa pela nota: renumerar uma nota muda só as caixas dela', () => {
    const boxes = placedBoxesOf(relabelCargoLayout(oldLayout, NEW_INPUT))

    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      if (box.documentId === 'doc-3') expect(box.documentNumber).toBe('313')
      if (box.documentId === 'doc-2') expect(box.documentNumber).toBe('202')
      if (box.stopSequence === 1) expect(box.label).toBe('Rua Nova, 10')
    }
  })

  test('parada sem par na entrada de agora fica como está — nada é inventado', () => {
    const relabeled = relabelCargoLayout(oldLayout, {
      ...NEW_INPUT,
      stops: NEW_STOPS.filter((stop) => stop.sequence !== 2),
    })

    const second = relabeled.rows.filter((row) => row.sequence === 2)
    expect(second.length).toBeGreaterThan(0)
    expect(second.every((row) => row.clientName === 'Outro Antigo')).toBe(true)
    expect(relabeled.slices.find((slice) => slice.sequence === 2)?.label).toBe('Rua B, 2')
    const secondBoxes = placedBoxesOf(relabeled).filter((box) => box.stopSequence === 2)
    expect(secondBoxes.some((box) => box.documentNumber === '303')).toBe(true)
    expect(relabeled.rows.find((row) => row.sequence === 1)?.clientName).toBe('Cliente Renomeado')
  })

  test('a caixa fora do baú com o rótulo antigo da parada leva o novo; motivo e contagem ficam', () => {
    const withUnplaced = {
      ...oldLayout,
      placement: {
        ...(oldLayout.placement as NonNullable<ResolvedCargoLayout['placement']>),
        unplaced: [
          { count: 3, label: 'Rua Velha, 1', reason: 'bedFull' },
          { count: 1, label: 'Produto sem parada', reason: 'notMeasured' },
        ],
      },
    } as ResolvedCargoLayout

    expect(relabelCargoLayout(withUnplaced, NEW_INPUT).placement?.unplaced).toEqual([
      { count: 3, label: 'Rua Nova, 10', reason: 'bedFull' },
      { count: 1, label: 'Produto sem parada', reason: 'notMeasured' },
    ])
  })

  test('não altera a planta recebida', () => {
    const before = structuredClone(oldLayout)

    relabelCargoLayout(oldLayout, NEW_INPUT)

    expect(oldLayout).toEqual(before)
  })
})
