/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildStopNotes,
  mixNoteTone,
  NOTE_TONE_THEMES,
  NOTE_TONES,
  noteToneOf,
  resolveNoteTones,
} from '@/modules/trip/shared/noteTone.service'
import { hexToLab, labDistance, stopColorOf } from '@/modules/trip/shared/stopColor.service'
import {
  EMPTY_CARGO_FOCUS,
  isBoxLit,
  toggleCargoStopFocus,
  toggleNoteFocus,
} from '@/modules/trip/shared/stopFocus.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

type NoteBox = { stopSequence: number; documentId: string | null; documentNumber: string | null }

function box(stopSequence: number, documentId: string | null, documentNumber?: string): NoteBox {
  return { documentId, documentNumber: documentNumber ?? null, stopSequence }
}

/** `stops` paradas com `notes` notas cada, duas caixas por nota. */
function trip3d(stops: number, notes: number): NoteBox[] {
  return Array.from({ length: stops }, (_, stop) =>
    Array.from({ length: notes }, (_, note) => [
      box(
        stop + 1,
        `doc-${String(stop + 1)}-${String(note)}`,
        `${String(stop + 1)}0${String(note)}`,
      ),
      box(
        stop + 1,
        `doc-${String(stop + 1)}-${String(note)}`,
        `${String(stop + 1)}0${String(note)}`,
      ),
    ]).flat(),
  ).flat()
}

/** Spec 119: cada nota da parada ganha um tom da cor da parada. */
describe('trip cargo note tone contract', () => {
  /** A mesma nota tem o mesmo tom em todo redesenho, qualquer que seja a ordem das caixas. */
  it('gives the same tone to the same note whatever order the boxes arrive in', () => {
    const boxes = [box(1, 'c'), box(1, 'a'), box(2, 'x'), box(1, 'b'), box(1, 'a')]
    const shuffled = [boxes[3], boxes[0], boxes[4], boxes[2], boxes[1]].flatMap((entry) =>
      entry === undefined ? [] : [entry],
    )

    expect([...resolveNoteTones(shuffled).entries()].sort()).toEqual(
      [...resolveNoteTones(boxes).entries()].sort(),
    )
  })

  /** Uma parada sozinha no desenho não tem com quem colidir: as notas saem todas em tons diferentes. */
  it('tells the notes of a stop apart', () => {
    const tones = resolveNoteTones([box(1, 'a'), box(1, 'b'), box(1, 'c'), box(1, 'd')])
    const used = ['a', 'b', 'c', 'd'].map((id) => noteToneOf(tones, box(1, id)))

    expect(new Set(used).size).toBe(4)
    /** A primeira nota é a cor da parada, sem mistura: parada de uma nota só não muda de cor. */
    expect(noteToneOf(tones, box(1, 'a'))).toBe(0)
  })

  /** Caixa sem nota conhecida é a cor da parada, nunca um tom inventado. */
  it('paints a box without a known note in the stop colour', () => {
    const tones = resolveNoteTones([box(1, 'a'), box(1, 'b'), box(1, null)])

    expect(noteToneOf(tones, box(1, null))).toBe(0)
  })

  /**
   * ⚠️ **O tom nunca fica mais perto de outra parada do que da própria**, nos dois temas. Medido: a
   * paleta de paradas é densa em CIELab, e nenhuma mistura fixa passa nisto a partir de ~8 paradas —
   * por isso a trava é por desenho, e é ela que este teste cobra, até a viagem de 85 paradas.
   */
  it('never lets a note tone read as another drawn stop', () => {
    for (const [stops, notes] of [
      [3, 5],
      [12, 5],
      [24, 5],
      [85, 3],
    ] as const) {
      const boxes = trip3d(stops, notes)
      const tones = resolveNoteTones(boxes)
      const bases = Array.from({ length: stops }, (_, index) => stopColorOf(index + 1))

      for (const entry of boxes) {
        const tone = noteToneOf(tones, entry)
        const own = stopColorOf(entry.stopSequence)
        for (const theme of NOTE_TONE_THEMES) {
          const toneLab = hexToLab(mixNoteTone({ color: own, theme, tone }))
          const ownDistance = labDistance(toneLab, hexToLab(own))
          bases.forEach((other, index) => {
            if (index + 1 === entry.stopSequence) return
            expect(labDistance(toneLab, hexToLab(other))).toBeGreaterThan(ownDistance)
          })
        }
      }
    }
  })

  /** Os tons que o desenho usa são os mesmos que o CSS mistura — um lugar decide, o outro pinta. */
  it('mixes the tones with tokens, never a loose hexadecimal', () => {
    const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')
    const index = readApplicationFile('src/styles/index.css')

    NOTE_TONES.forEach((tone, position) => {
      if (tone.towards === null) return
      const rule = css.match(new RegExp(`\\.noteTone${String(position)} \\{([^}]*)\\}`))?.[1] ?? ''
      expect(rule).toContain(
        `color-mix(in srgb, currentColor ${String(Math.round(tone.keep * 100))}%, var(--color-${tone.towards}))`,
      )
      expect(rule).not.toContain('#')
    })
    /** A cópia por valor dos tokens, que a conta sem DOM precisa, bate com `index.css`. */
    const [dark, light] = NOTE_TONE_THEMES
    expect(index).toContain(`--color-fog: ${dark?.fog ?? ''};`)
    expect(index).toContain(`--color-asphalt: ${dark?.asphalt ?? ''};`)
    expect(index).toContain(`--color-fog: ${light?.fog ?? ''};`)
    expect(index).toContain(`--color-asphalt: ${light?.asphalt ?? ''};`)
  })

  /**
   * ⚠️ **A presumida não é mais o tom claro**: o preenchimento agora é da nota, e a lavagem brigaria
   * com ele. A marca é o contorno pontilhado — borda, não face, e nunca hachura.
   */
  it('marks the presumed box by its outline, not by its tone', () => {
    const component = readApplicationFile('src/components/ui/cargo-isometric.tsx')
    const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')
    const layers = readApplicationFile('src/modules/trip/components/TripCargoLayers.component.tsx')

    expect(component).not.toContain('faceWash')
    expect(component).toContain('box.isEstimated && !box.isGhost && styles.facePresumed')
    const presumed = css.match(/\.facePresumed \{([^}]*)\}/)?.[1] ?? ''
    expect(presumed).toContain('stroke-dasharray')
    expect(presumed).not.toContain('fill')
    /** O tom sai só da nota: a origem da caixa não entra na conta. */
    expect(layers).toContain('tone: noteToneOf(tones, box)')
    expect(trip.cargoLayers.legend.presumed).toContain('pontilhado')
    expect(tripEn.cargoLayers.legend.presumed).toContain('Dotted')
  })

  /** Acender uma nota acende só as caixas dela, e soma com as paradas acesas. */
  it('lights only the boxes of the chosen note', () => {
    const noteFocus = toggleNoteFocus(EMPTY_CARGO_FOCUS, 'a')

    expect(isBoxLit(EMPTY_CARGO_FOCUS, box(1, 'a'))).toBe(true)
    expect(isBoxLit(noteFocus, box(1, 'a'))).toBe(true)
    expect(isBoxLit(noteFocus, box(1, 'b'))).toBe(false)
    expect(isBoxLit(noteFocus, box(2, null))).toBe(false)

    const withStop = toggleCargoStopFocus(noteFocus, 2)
    expect(isBoxLit(withStop, box(2, null))).toBe(true)
    expect(isBoxLit(withStop, box(1, 'b'))).toBe(false)

    /** Apagar a última escolha devolve o baú inteiro. */
    const cleared = toggleNoteFocus(noteFocus, 'a')
    expect(isBoxLit(cleared, box(3, 'z'))).toBe(true)
    expect(noteFocus.notes.has('a')).toBe(true)
  })

  /** A lista da ficha: notas da parada com o tom e as caixas de cada uma, pelo número impresso. */
  it('lists the notes of each stop with their tone and box count', () => {
    const boxes = [box(1, 'b', '900'), box(1, 'a', '120'), box(1, 'a', '120'), box(1, null)]
    const notes = buildStopNotes(boxes).get(1) ?? []
    const tones = resolveNoteTones(boxes)

    expect(notes.map((note) => note.documentNumber)).toEqual(['120', '900'])
    expect(notes.map((note) => note.boxes)).toEqual([2, 1])
    expect(notes[0]?.tone).toBe(noteToneOf(tones, box(1, 'a')))
  })

  /** A ficha usa botão com `aria-pressed` e os textos novos existem nos dois idiomas. */
  it('wires the note list to the focus with accessible buttons', () => {
    const layers = readApplicationFile('src/modules/trip/components/TripCargoLayers.component.tsx')

    expect(layers).toContain('aria-pressed={focus.notes.has(note.documentId)}')
    expect(layers).toContain('toggleNoteFocus(previous, note.documentId)')
    expect(layers).toContain('isBoxLit(focus, box)')
    expect(layers).not.toContain('title=')
    for (const locale of [trip, tripEn]) {
      expect(locale.cargoLayers.invoice.listLabel).toBeTruthy()
      expect(locale.cargoLayers.invoice.number).toContain('{{number}}')
      expect(locale.cargoLayers.invoice.toggle).toContain('{{label}}')
      expect(locale.cargoLayers.legend.notes).toBeTruthy()
    }
  })
})
