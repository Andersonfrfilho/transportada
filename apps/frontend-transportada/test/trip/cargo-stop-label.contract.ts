/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildCargoStopLabels,
  formatCargoStopLabel,
} from '@/modules/trip/shared/cargoStopLabel.service'
import type { TripStopDetail } from '@/modules/trip/shared/trip.types'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripCargoLayers.component.tsx',
  import.meta.url,
)

function stop(overrides: Partial<TripStopDetail>): TripStopDetail {
  return {
    addressKey: 'k',
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-1',
    label: 'AVENIDA 07, 903, ORLANDIA, SP',
    sequence: 1,
    ...overrides,
  }
}

function document(nfeNumber: null | string, name?: string) {
  return {
    contact: name === undefined ? null : { contractorName: null, name, phone: null, taxId: '1' },
    nfeNumber,
  } as unknown as TripStopDetail['documents'][number]
}

/**
 * Spec 095: **"Parada 3" não identifica nada.** O separador procura o número da nota que ele bipou e
 * o nome do cliente na etiqueta; a ordem é só a posição na fila, e sozinha ela obriga a pessoa a
 * voltar à lista de notas para descobrir de quem é a carga que está na mão dela.
 */
describe('trip cargo stop label contract', () => {
  it('names the stop by note, client and address', () => {
    const labels = buildCargoStopLabels([
      stop({ documents: [document('883649', 'MINIMERCADO ABADE')], sequence: 2 }),
    ])

    expect(formatCargoStopLabel(labels.get(2))).toBe(
      '883649 · MINIMERCADO ABADE · AVENIDA 07, 903, ORLANDIA, SP',
    )
  })

  /** A lista é cortada, nunca omitida: uma parada de quarenta notas viraria uma ficha do tamanho da tela. */
  it('counts the notes it could not list', () => {
    const labels = buildCargoStopLabels([
      stop({
        documents: [document('1'), document('2'), document('3'), document('4'), document('5')],
      }),
    ])

    expect(formatCargoStopLabel(labels.get(1))).toContain('1, 2, 3 +2')
  })

  /** Nota sem número e parada sem contato não inventam texto: o que falta simplesmente não aparece. */
  it('drops what the stop does not have', () => {
    const labels = buildCargoStopLabels([stop({ documents: [document(null)] })])

    expect(formatCargoStopLabel(labels.get(1))).toBe('AVENIDA 07, 903, ORLANDIA, SP')
    expect(formatCargoStopLabel(undefined)).toBe('')
  })

  /**
   * ⚠️ A camada só entra em foco depois que o operador **navega**: abrir a tela com as camadas de
   * cima esmaecidas lia como caixa transparente, não como "a camada aberta é a de baixo".
   */
  it('shows the whole stack solid until a layer is chosen', () => {
    const source = readFileSync(COMPONENT, 'utf8')

    expect(source).toContain('hasChosenLayer ? { focusLayer: current.index } : {}')
    expect(source).toContain('setHasChosenLayer(true)')
  })
})
