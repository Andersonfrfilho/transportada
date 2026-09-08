/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildCargoStopLabels,
  formatCargoStopLabel,
} from '@/modules/trip/shared/cargoStopLabel.service'
import type { TripCargoLayout } from '@/modules/trip/shared/trip.types'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripCargoLayers.component.tsx',
  import.meta.url,
)

function row(overrides: Partial<TripCargoLayout['rows'][number]>): TripCargoLayout['rows'][number] {
  return {
    clientName: '',
    label: 'AVENIDA 07, 903, ORLANDIA, SP',
    loadOrder: 1,
    noteNumbers: [],
    sequence: 1,
    sideReachable: false,
    ...overrides,
  }
}

/**
 * Spec 095: **"Parada 3" não identifica nada.** O separador procura o número da nota que ele bipou e
 * o nome do cliente na etiqueta; a ordem é só a posição na fila, e sozinha ela obriga a pessoa a
 * voltar à lista de notas para descobrir de quem é a carga que está na mão dela.
 */
describe('trip cargo stop label contract', () => {
  it('names the stop by note, client and address', () => {
    const labels = buildCargoStopLabels([
      row({ clientName: 'MINIMERCADO ABADE', noteNumbers: ['883649'], sequence: 2 }),
    ])

    expect(formatCargoStopLabel(labels.get(2))).toBe(
      '883649 · MINIMERCADO ABADE · AVENIDA 07, 903, ORLANDIA, SP',
    )
  })

  /**
   * A lista é cortada, nunca omitida: uma parada com quarenta notas viraria uma ficha do tamanho da
   * tela, e nenhuma nota some sem que o "+N" diga quantas ficaram.
   */
  it('counts the notes it could not list', () => {
    const labels = buildCargoStopLabels([row({ noteNumbers: ['1', '2', '3', '4', '5'] })])

    expect(formatCargoStopLabel(labels.get(1))).toContain('1, 2, 3 +2')
  })

  /** Parada sem nome e sem número não inventa texto: o que falta simplesmente não aparece. */
  it('drops what the stop does not have', () => {
    const labels = buildCargoStopLabels([row({})])

    expect(formatCargoStopLabel(labels.get(1))).toBe('AVENIDA 07, 903, ORLANDIA, SP')
    expect(formatCargoStopLabel(undefined)).toBe('')
  })

  /**
   * ⚠️ A identificação vem da **linha do layout**, e não de um segundo agrupamento no cliente: foi o
   * agrupamento por endereço do servidor que formou a parada.
   */
  it('reads the identification from the layout row', () => {
    const source = readFileSync(COMPONENT, 'utf8')

    expect(source).toContain('buildCargoStopLabels(layout.rows)')
  })

  /**
   * ⚠️ A camada só entra em foco depois que o operador **navega**: abrir a tela com as camadas de
   * cima esmaecidas lia como caixa transparente, não como "a camada aberta é a de baixo".
   */
  it('shows the whole stack solid until a layer is chosen', () => {
    const source = readFileSync(COMPONENT, 'utf8')

    expect(source).toContain('hasChosenLayer ? { focusLayer: current.index } : {}')
  })
})
