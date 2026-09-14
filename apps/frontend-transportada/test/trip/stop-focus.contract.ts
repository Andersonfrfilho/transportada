/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  EMPTY_STOP_FOCUS,
  isStopLit,
  toggleStopFocus,
} from '@/modules/trip/shared/stopFocus.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/** Spec 095 G006: isolar a parada no desenho, com multisseleção. */
describe('trip stop focus contract', () => {
  /** Sem escolha nenhuma o desenho é o de sempre — e "todas" não é um estado guardado. */
  it('lights every stop while nothing is chosen', () => {
    expect(isStopLit(EMPTY_STOP_FOCUS, 1)).toBe(true)
    expect(isStopLit(EMPTY_STOP_FOCUS, 9)).toBe(true)
  })

  it('lights several stops at once', () => {
    const focus = toggleStopFocus(toggleStopFocus(EMPTY_STOP_FOCUS, 1), 3)

    expect(isStopLit(focus, 1)).toBe(true)
    expect(isStopLit(focus, 3)).toBe(true)
    expect(isStopLit(focus, 2)).toBe(false)
  })

  /** Apagar a última acesa devolve o baú inteiro, em vez de deixar a tela toda cinza. */
  it('returns to the whole bed when the last chosen stop is turned off', () => {
    const focus = toggleStopFocus(toggleStopFocus(EMPTY_STOP_FOCUS, 2), 2)

    expect(focus.size).toBe(0)
    expect(isStopLit(focus, 5)).toBe(true)
  })

  /** O conjunto não é mutado no lugar: é ele que o React compara para redesenhar. */
  it('never mutates the set it was given', () => {
    const focus = toggleStopFocus(EMPTY_STOP_FOCUS, 1)
    const next = toggleStopFocus(focus, 2)

    expect(focus.has(2)).toBe(false)
    expect(next).not.toBe(focus)
  })

  /**
   * ⚠️ A parada apagada vira **fantasma cinza sólido**, e não some nem vira tracejado. O tracejado
   * parecia bom com três caixas e virava uma teia de linhas com trinta; e escondê-la faria a carga
   * escolhida parecer caber em qualquer lugar do baú, quando o espaço continua ocupado.
   */
  it('greys the other stops instead of hiding them', () => {
    const component = readApplicationFile(
      'src/modules/trip/components/TripCargoLayers.component.tsx',
    )
    const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')

    expect(component).toContain('isBoxLit(focus, box)')
    expect(component).toContain('aria-pressed')
    expect(css).toContain('.boxGhost')
    expect(css).not.toContain('stroke-dasharray: 3')
  })
})
