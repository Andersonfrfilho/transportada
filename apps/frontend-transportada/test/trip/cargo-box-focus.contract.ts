/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  EMPTY_CARGO_FOCUS,
  isBoxLit,
  toggleBoxFocus,
  toggleCargoStopFocus,
  toggleNoteFocus,
} from '@/modules/trip/shared/stopFocus.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

type FocusBox = Readonly<{
  documentId?: string | null | undefined
  id: string
  stopSequence: number
}>

function box(id: string, stopSequence: number, documentId: string | null = null): FocusBox {
  return { documentId, id, stopSequence }
}

/** Spec 131: clicar numa caixa acende a nota inteira; clicar de novo apaga só ela. */
describe('trip cargo box focus contract', () => {
  /** Baú todo aceso: a primeira caixa clicada acende a nota (ou a parada, sem nota) dela. */
  it('lights the whole load of the clicked box when everything is lit', () => {
    const withNote = toggleBoxFocus(EMPTY_CARGO_FOCUS, box('0-0', 1, 'doc-a'))
    expect(withNote.notes.has('doc-a')).toBe(true)
    expect(withNote.stops.size).toBe(0)
    expect(isBoxLit(withNote, box('0-1', 1, 'doc-a'))).toBe(true)
    expect(isBoxLit(withNote, box('0-2', 2, 'doc-b'))).toBe(false)

    const withoutNote = toggleBoxFocus(EMPTY_CARGO_FOCUS, box('1-0', 3, null))
    expect(withoutNote.stops.has(3)).toBe(true)
    expect(withoutNote.notes.size).toBe(0)
  })

  /** Clicar numa caixa acesa pela nota/parada apaga só ela — a nota continua acesa nas outras. */
  it('hides only the clicked box when its load is already lit', () => {
    const lit = toggleNoteFocus(EMPTY_CARGO_FOCUS, 'doc-a')
    const hidden = toggleBoxFocus(lit, box('0-0', 1, 'doc-a'))

    expect(hidden.notes.has('doc-a')).toBe(true)
    expect(isBoxLit(hidden, box('0-0', 1, 'doc-a'))).toBe(false)
    expect(isBoxLit(hidden, box('0-1', 1, 'doc-a'))).toBe(true)
  })

  /** Clicar de novo na caixa apagada restaura só ela. */
  it('restores a hidden box when clicked again', () => {
    const lit = toggleNoteFocus(EMPTY_CARGO_FOCUS, 'doc-a')
    const hidden = toggleBoxFocus(lit, box('0-0', 1, 'doc-a'))
    const restored = toggleBoxFocus(hidden, box('0-0', 1, 'doc-a'))

    expect(restored.hiddenBoxes.size).toBe(0)
    expect(isBoxLit(restored, box('0-0', 1, 'doc-a'))).toBe(true)
  })

  /** Caixa de outra carga, com foco já ativo, soma ao foco em vez de apagar. */
  it('adds another load to the focus instead of hiding it', () => {
    const lit = toggleNoteFocus(EMPTY_CARGO_FOCUS, 'doc-a')
    const withSecondNote = toggleBoxFocus(lit, box('1-0', 2, 'doc-b'))

    expect(withSecondNote.notes.has('doc-a')).toBe(true)
    expect(withSecondNote.notes.has('doc-b')).toBe(true)
    expect(isBoxLit(withSecondNote, box('1-0', 2, 'doc-b'))).toBe(true)
  })

  /**
   * ⚠️ Voltar a "tudo aceso" — apagando a última nota ou parada do foco — devolve toda caixa
   * individualmente apagada junto: um recorte de caixa não sobrevive à carga que o continha.
   */
  it('resets hidden boxes once the focus goes back to everything lit', () => {
    const lit = toggleNoteFocus(EMPTY_CARGO_FOCUS, 'doc-a')
    const hidden = toggleBoxFocus(lit, box('0-0', 1, 'doc-a'))
    expect(hidden.hiddenBoxes.size).toBe(1)

    const cleared = toggleNoteFocus(hidden, 'doc-a')
    expect(cleared.hiddenBoxes.size).toBe(0)
    expect(isBoxLit(cleared, box('0-0', 1, 'doc-a'))).toBe(true)

    const litStop = toggleCargoStopFocus(EMPTY_CARGO_FOCUS, 5)
    const hiddenStop = toggleBoxFocus(litStop, box('2-0', 5, null))
    expect(hiddenStop.hiddenBoxes.size).toBe(1)

    const clearedStop = toggleCargoStopFocus(hiddenStop, 5)
    expect(clearedStop.hiddenBoxes.size).toBe(0)
  })

  it('wires the isometric drawing to the click handler', () => {
    const layers = readApplicationFile('src/modules/trip/components/TripCargoLayers.component.tsx')

    expect(layers).toContain('onBoxSelect={handleBoxSelect}')
    expect(layers).toContain('toggleBoxFocus(previous, box)')
  })

  it('makes every clickable box keyboard accessible', () => {
    const isometric = readApplicationFile('src/components/ui/cargo-isometric.tsx')

    expect(isometric).toContain("role={isSelectable ? 'button' : undefined}")
    expect(isometric).toContain('tabIndex={isSelectable ? 0 : undefined}')
  })

  /** Arrastar não seleciona: o clique só conta se o ponteiro ficou perto de onde desceu. */
  it('ignores the click after the pointer drags past the threshold', () => {
    const layers = readApplicationFile('src/modules/trip/components/TripCargoLayers.component.tsx')

    expect(layers).toContain('pointerDownAt')
    expect(layers).toContain('hasDraggedPastClickThreshold')
    expect(layers).toContain('Math.hypot(event.clientX - start.x, event.clientY - start.y)')
    expect(layers).toContain('if (hasDraggedPastClickThreshold.current) return')
  })

  it('names the box labels and the legend hint in both languages', () => {
    for (const locale of [trip, tripEn]) {
      expect(locale.cargoLayers.box.toggle).toBeTruthy()
      expect(locale.cargoLayers.box.toggleWithoutNote).toBeTruthy()
      expect(locale.cargoLayers.legend.select).toBeTruthy()
    }
  })
})
