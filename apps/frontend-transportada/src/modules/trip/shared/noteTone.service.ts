/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { hexToLab, labDistance, stopColorOf } from './stopColor.service'

/**
 * Spec 119: os tons de nota dentro da cor da parada. O primeiro é a própria cor; os outros a
 * misturam a um token do tema, e é o CSS que mistura (`.noteTone1`…`.noteTone4` em
 * `cargo-isometric.module.css`) — aqui a mesma conta existe só para a trava abaixo, que roda sem DOM.
 */
export const NOTE_TONES = [
  { keep: 1, towards: null },
  { keep: 0.8, towards: 'fog' },
  { keep: 0.8, towards: 'asphalt' },
  { keep: 0.64, towards: 'fog' },
  { keep: 0.64, towards: 'asphalt' },
] as const satisfies readonly Readonly<{ keep: number; towards: 'asphalt' | 'fog' | null }>[]

export type NoteToneTheme = Readonly<{ asphalt: string; fog: string }>

/**
 * ⚠️ Cópia por valor de `--color-fog` e `--color-asphalt` de `index.css`, nos **dois** temas — o
 * mesmo motivo de `MAP_SURFACE` em `stopColor.service.ts`: a conta roda sem DOM. O contrato compara.
 */
export const NOTE_TONE_THEMES: readonly NoteToneTheme[] = [
  { asphalt: '#10222c', fog: '#f0f2ee' },
  { asphalt: '#f2efe9', fog: '#1d2b33' },
]

type NoteBox = Readonly<{ documentId?: string | null | undefined; stopSequence: number }>

/** O tom de cada nota, pelo `documentId`. Nota ausente do mapa é a cor da parada. */
export type NoteTones = ReadonlyMap<string, number>

export type StopNote = Readonly<{
  boxes: number
  documentId: string
  documentNumber: string | null
  tone: number
}>

/** A cor que `color-mix(in srgb, cor N%, token)` produz — a mesma conta, canal a canal. */
export function mixNoteTone(
  input: Readonly<{ color: string; theme: NoteToneTheme; tone: number }>,
): string {
  const tone = NOTE_TONES[input.tone]
  if (tone === undefined || tone.towards === null) return input.color
  const target = input.theme[tone.towards]
  const channel = (hex: string, start: number): number =>
    Number.parseInt(hex.slice(start, start + 2), 16)

  return `#${[1, 3, 5]
    .map((start) =>
      Math.round(channel(input.color, start) * tone.keep + channel(target, start) * (1 - tone.keep))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/**
 * O tom de cada nota do desenho.
 *
 * ⚠️ **A nota recebe o tom pela posição do id dela entre os ids da parada, ordenados** — nunca pela
 * ordem em que as caixas chegam. A mesma nota sai no mesmo tom em todo redesenho.
 *
 * ⚠️ **Tom que lê como outra parada não é oferecido.** Medido: a paleta das paradas é densa em
 * CIELab, e nenhuma mistura fixa distingue as notas e fica longe de todas as paradas — com 18% o
 * tom já fica mais perto de outra parada a partir de 8 paradas. A trava é por desenho: o tom só entra
 * na lista da parada se, nos dois temas, fica mais perto da cor dela do que da de qualquer outra
 * parada desenhada. Na viagem grande as notas de uma parada podem repetir tom; acender a nota é o
 * caminho inequívoco.
 */
export function resolveNoteTones(
  boxes: readonly NoteBox[],
  colorOf: (sequence: number) => string = stopColorOf,
): NoteTones {
  const notesByStop = new Map<number, Set<string>>()
  for (const box of boxes) {
    const notes = notesByStop.get(box.stopSequence) ?? new Set<string>()
    if (box.documentId !== null && box.documentId !== undefined) notes.add(box.documentId)
    notesByStop.set(box.stopSequence, notes)
  }

  const stopLabs = new Map(
    [...notesByStop.keys()].map((sequence) => [sequence, hexToLab(colorOf(sequence))] as const),
  )
  const tones = new Map<string, number>()
  for (const [sequence, notes] of notesByStop) {
    /** Uma nota só é a cor da parada: nada a distinguir, e a conta da trava fica de fora. */
    const offered = notes.size < 2 ? [0] : safeTonesOf({ colorOf, sequence, stopLabs })
    ;[...notes].sort().forEach((documentId, rank) => {
      tones.set(documentId, offered[rank % offered.length] ?? 0)
    })
  }

  return tones
}

export function noteToneOf(tones: NoteTones, box: NoteBox): number {
  if (box.documentId === null || box.documentId === undefined) return 0

  return tones.get(box.documentId) ?? 0
}

/**
 * As notas de cada parada, pelo número impresso — é por ele que a nota é procurada. Caixa sem nota
 * conhecida não vira linha: não há o que acender por ela.
 */
export function buildStopNotes(
  boxes: readonly (NoteBox & Readonly<{ documentNumber?: string | null | undefined }>)[],
  tones: NoteTones = resolveNoteTones(boxes),
): ReadonlyMap<number, readonly StopNote[]> {
  const byStop = new Map<number, Map<string, { boxes: number; documentNumber: string | null }>>()
  for (const box of boxes) {
    if (box.documentId === null || box.documentId === undefined) continue
    const notes =
      byStop.get(box.stopSequence) ??
      new Map<string, { boxes: number; documentNumber: string | null }>()
    const current = notes.get(box.documentId) ?? {
      boxes: 0,
      documentNumber: box.documentNumber ?? null,
    }
    current.boxes += 1
    notes.set(box.documentId, current)
    byStop.set(box.stopSequence, notes)
  }

  return new Map(
    [...byStop].map(([sequence, notes]) => [
      sequence,
      [...notes]
        .map(([documentId, note]) => ({
          boxes: note.boxes,
          documentId,
          documentNumber: note.documentNumber,
          tone: tones.get(documentId) ?? 0,
        }))
        .sort(compareNotes),
    ]),
  )
}

function safeTonesOf(
  input: Readonly<{
    colorOf: (sequence: number) => string
    sequence: number
    stopLabs: ReadonlyMap<number, readonly number[]>
  }>,
): readonly number[] {
  const own = input.colorOf(input.sequence)
  const ownLab = input.stopLabs.get(input.sequence) ?? hexToLab(own)

  return NOTE_TONES.flatMap((_, tone) =>
    tone === 0 ||
    NOTE_TONE_THEMES.every((theme) => {
      const lab = hexToLab(mixNoteTone({ color: own, theme, tone }))
      const ownDistance = labDistance(lab, ownLab)
      for (const [other, otherLab] of input.stopLabs) {
        if (other !== input.sequence && labDistance(lab, otherLab) <= ownDistance) return false
      }
      return true
    })
      ? [tone]
      : [],
  )
}

function compareNotes(first: StopNote, second: StopNote): number {
  if (first.documentNumber === null || second.documentNumber === null) {
    if (first.documentNumber !== second.documentNumber)
      return first.documentNumber === null ? 1 : -1
    return first.documentId < second.documentId ? -1 : 1
  }
  const byNumber = first.documentNumber.localeCompare(second.documentNumber, 'pt-BR', {
    numeric: true,
  })
  if (byNumber !== 0) return byNumber

  return first.documentId < second.documentId ? -1 : 1
}
