/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveSeparationOccurrenceButtonVisibility } from '../../src/modules/trip/shared/separationOccurrenceButton.service'
import type { OccurrenceType } from '../../src/modules/trip/shared/occurrence.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readFile(path: string): Promise<string> {
  return Bun.file(new URL(path, APPLICATION_ROOT)).text()
}

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: 'type-1',
    name: 'Avaria',
    notifies: false,
    stage: 'separation',
    ...overrides,
  }
}

/**
 * Pedido: "toda nota que está na viagem para separar" precisa do botão de ocorrência de separação,
 * enquanto a viagem ainda está editável e a empresa tem tipo ativo de galpão cadastrado.
 */
describe('visibilidade do botão de ocorrência de separação na linha da nota', () => {
  test('aparece com viagem editável, trip.manage e tipo de separação ativo', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [buildType()],
      }),
    ).toBe(true)
  })

  test('não aparece sem trip.manage', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: false,
        isEditable: true,
        types: [buildType()],
      }),
    ).toBe(false)
  })

  test('não aparece com a viagem despachada (não editável)', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: false,
        types: [buildType()],
      }),
    ).toBe(false)
  })

  test('não aparece quando só existem tipos de rua (delivery)', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [buildType({ id: 'street', stage: 'delivery' })],
      }),
    ).toBe(false)
  })

  test('não aparece quando o único tipo de separação está aposentado', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [buildType({ active: false })],
      }),
    ).toBe(false)
  })

  test('não aparece sem nenhum tipo cadastrado', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [],
      }),
    ).toBe(false)
  })
})

/**
 * Varredura de fonte: prova que o botão está na linha da nota (`TripStopList`, não só no
 * comprovante) e que ele abre o registro de ocorrência de separação — sem suíte de render, o
 * contrato do módulo é a fonte grepada (`apps/frontend-transportada/CLAUDE.md`).
 */
describe('varredura de fonte: botão na linha da nota', () => {
  test('TripStopList renderiza o botão de ocorrência de separação por nota', async () => {
    const source = await readFile('src/modules/trip/components/TripStopList.component.tsx')

    expect(source).toContain('canSeparationOccurrence')
    expect(source).toContain('onOpenSeparationOccurrence(document.id)')
    expect(source).toMatch(
      /actions\.separationOccurrence[\s\S]{0,200}?name="alert"|name="alert"[\s\S]{0,200}?actions\.separationOccurrence/,
    )
  })

  test('TripDetail abre o diálogo de ocorrência de separação a partir da linha da nota', async () => {
    const source = await readFile('src/modules/trip/components/TripDetail.component.tsx')

    expect(source).toContain('SeparationOccurrenceDialog')
    expect(source).toContain('onOpenSeparationOccurrence')
    expect(source).toContain('resolveSeparationOccurrenceButtonVisibility')
  })

  test('SeparationOccurrenceDialog reaproveita TripOccurrences, não duplica o formulário', async () => {
    const source = await readFile(
      'src/modules/trip/components/SeparationOccurrenceDialog.component.tsx',
    )

    expect(source).toContain('TripOccurrences')
    expect(source).toContain('useModalDialog')
  })
})
