/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  INTERACTIVE_ELEMENT_SELECTOR,
  shouldOpenTripFromRowClick,
} from '../../src/modules/trip/shared/tripRowClick.service.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const PLAIN_CLICK = {
  targetIsInteractive: false,
  hasTextSelection: false,
  button: 0,
  hasModifierKey: false,
} as const

describe('clique na linha da lista de viagens', () => {
  test('clique simples numa célula abre a viagem', () => {
    expect(shouldOpenTripFromRowClick(PLAIN_CLICK)).toBe(true)
  })

  test('clique vindo de elemento interativo (checkbox, copiar, Ver) não abre', () => {
    expect(shouldOpenTripFromRowClick({ ...PLAIN_CLICK, targetIsInteractive: true })).toBe(false)
  })

  test('texto selecionado não abre (quem arrasta para copiar não quer navegar)', () => {
    expect(shouldOpenTripFromRowClick({ ...PLAIN_CLICK, hasTextSelection: true })).toBe(false)
  })

  test('botão não principal e tecla modificadora não abrem', () => {
    expect(shouldOpenTripFromRowClick({ ...PLAIN_CLICK, button: 1 })).toBe(false)
    expect(shouldOpenTripFromRowClick({ ...PLAIN_CLICK, button: 2 })).toBe(false)
    expect(shouldOpenTripFromRowClick({ ...PLAIN_CLICK, hasModifierKey: true })).toBe(false)
  })

  test('o seletor cobre botão, link, campos e papéis interativos', () => {
    for (const part of [
      'button',
      'a',
      'input',
      'label',
      'select',
      'textarea',
      '[role="button"]',
      '[role="checkbox"]',
      '[role="switch"]',
    ]) {
      expect(INTERACTIVE_ELEMENT_SELECTOR.split(',').map((item) => item.trim())).toContain(part)
    }
  })
})

describe('linha clicável na tabela de viagens (fonte)', () => {
  test('a <tr> usa o handler e a classe; teclado segue pelo botão Ver, sem tabIndex/role na linha', async () => {
    const source = await readApplicationFile('src/modules/trip/components/TripTable.component.tsx')
    const rowStart = source.search(/<tr\s+key=\{trip\.id\}/)
    const rowTag = source.slice(rowStart, source.indexOf('<td', rowStart))

    expect(rowTag).toContain('styles.clickableRow')
    expect(rowTag).toContain('onClick={(event) => handleRowClick(event, trip.id)}')
    expect(rowTag).not.toContain('tabIndex')
    expect(rowTag).not.toContain('role=')
    expect(source).toContain('onClick={() => table.openTrip(trip.id)}')
    expect(source).toContain('shouldOpenTripFromRowClick')
  })

  test('a folha dá cursor pointer e destaque de hover/focus-within à linha', async () => {
    const stylesheet = await readApplicationFile('src/modules/trip/styles/trip.module.css')

    expect(stylesheet).toMatch(/\.clickableRow\s*\{[^}]*cursor:\s*pointer/)
    expect(stylesheet).toContain('.dataTable tbody tr.clickableRow:hover')
    expect(stylesheet).toContain('.dataTable tbody tr.clickableRow:focus-within')
  })
})
