import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  buildStopNotes,
  countNotesSharingColor,
  NOTE_COLORS,
  noteColorOf,
  resolveNoteColors,
  resolveSplitPieces,
} from '@/modules/trip/shared/noteColor.service'
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
  return Array.from({ length: stops }, (_unused, stop) =>
    Array.from({ length: notes }, (_ignored, note) => [
      box(stop + 1, `doc-${String(stop + 1)}-${String(note)}`),
      box(stop + 1, `doc-${String(stop + 1)}-${String(note)}`),
    ]).flat(),
  ).flat()
}

/**
 * ⚠️ **"Perceptualmente a mesma cor" é 6,2** — o número que a spec 119 mediu ao recusar o matiz por
 * ângulo áureo (ΔE 6,2 entre 24 paradas). É o piso que todo par desta paleta tem de superar, e a
 * medição de hoje deixa folga: 8,09 entre as 128, 8,15 até o `MAP_SURFACE` e 8,21 até a cor de
 * parada mais próxima.
 */
const SAME_COLOUR_DISTANCE = 6.2

/** Contraste mínimo contra os dois fundos, o mesmo da paleta de paradas. */
const MIN_CONTRAST = 2.4

/** A janela de luminância relativa que serve aos dois temas sem redeclarar a paleta. */
const LUMINANCE_WINDOW = { maximum: 0.33, minimum: 0.11 } as const

const THEME_BACKGROUNDS = ['#10222c', '#fbf9f5'] as const

/**
 * O que já se desenha sobre mapa, lido do **fonte** de `stopColor.service.ts`: assim a lista não é
 * copiada uma terceira vez, e cor nova lá entra sozinha nesta conferência.
 */
function readMapSurface(): readonly string[] {
  const source = readApplicationFile('src/modules/trip/shared/stopColor.service.ts')
  const block = source.match(/const MAP_SURFACE = \[([\s\S]*?)\] as const/)?.[1] ?? ''

  return block.match(/#[0-9a-f]{6}/gu) ?? []
}

function channelsOf(hex: string): readonly number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
}

function relativeLuminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channelsOf(hex).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function minimumDistanceWithin(colors: readonly string[]): number {
  const labs = colors.map(hexToLab)
  let minimum = Number.POSITIVE_INFINITY
  for (let first = 0; first < labs.length; first += 1) {
    for (let second = first + 1; second < labs.length; second += 1) {
      minimum = Math.min(minimum, labDistance(labs[first] ?? [], labs[second] ?? []))
    }
  }

  return minimum
}

/**
 * Spec 121: **a caixa é pintada pela cor da nota**, e não mais por um tom da cor da parada.
 *
 * ⚠️ Este arquivo substitui `note-tone.contract.ts`, e a substituição é a decisão, não um
 * detalhe de arquivo: a 119 dava à nota um tom da cor da parada, e a trava que impedia o tom de ler
 * como outra parada devolvia poucos tons — nas viagens grandes as notas de uma parada repetiam tom
 * e a distinção que o tom prometia não existia. O que se afirma aqui é o que ficou no lugar dela.
 */
describe('trip cargo note colour contract', () => {
  describe('a lista de cores', () => {
    /** Item malformado é a forma mais barata de a paleta quebrar sem ninguém ver. */
    it('carries well-formed, unique colours', () => {
      expect(NOTE_COLORS.length).toBeGreaterThanOrEqual(128)
      for (const color of NOTE_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/u)
      expect(new Set(NOTE_COLORS).size).toBe(NOTE_COLORS.length)
    })

    /**
     * ⚠️ **A lista cresce sem quebrar, e é isso que a ordenação promete.** Cor nova entra no fim, e
     * o que tem de continuar valendo é que o prefixo nunca melhora: a viagem pequena usa o topo, que
     * é a parte bem separada, e acrescentar cor no fim não pode afrouxar o que já estava lá.
     */
    it('is ordered from the most different colours to the least, and every prefix stays apart', () => {
      let previous = Number.POSITIVE_INFINITY
      for (const size of [4, 8, 16, 32, 64, 94, NOTE_COLORS.length]) {
        const distance = minimumDistanceWithin(NOTE_COLORS.slice(0, size))
        expect(distance).toBeLessThanOrEqual(previous)
        expect(distance).toBeGreaterThan(SAME_COLOUR_DISTANCE)
        previous = distance
      }
    })

    /**
     * ⚠️ A colisão que originou a regra das paradas era **literal** (`--color-cargo-stop-2` era
     * exatamente `--color-copper`), e a cor da nota está sobre o mesmo desenho.
     */
    it('never lands on what is already drawn over the map', () => {
      const surface = readMapSurface().map(hexToLab)
      expect(surface.length).toBeGreaterThan(0)
      for (const color of NOTE_COLORS) {
        for (const drawn of surface) {
          expect(labDistance(hexToLab(color), drawn)).toBeGreaterThan(SAME_COLOUR_DISTANCE)
        }
      }
    })

    /**
     * ⚠️ **A cor de nota não é a cor de uma parada.** `TripAssemblyMap` e `TripCargoPanel` ficam na
     * mesma tela na proposta e no diálogo de criação: gerar a paleta da nota só contra o
     * `MAP_SURFACE` devolvia exatamente a sequência de `stopColorOf`, e a caixa saía na cor do disco
     * da parada ao lado. A geração é semeada com as 96 primeiras cores de parada — a maior viagem
     * real tem 85 —, e isto cobra o resultado.
     */
    it('never lands on a stop colour either, for every stop a real trip can draw', () => {
      const stops = Array.from({ length: 96 }, (_unused, index) => hexToLab(stopColorOf(index + 1)))
      for (const color of NOTE_COLORS) {
        for (const stop of stops) {
          expect(labDistance(hexToLab(color), stop)).toBeGreaterThan(SAME_COLOUR_DISTANCE)
        }
      }
    })

    /**
     * ⚠️ **A paleta não é redeclarada por tema** — a mesma lista serve o escuro e o claro, como a das
     * paradas —, e é por isso que a luminância é presa a uma janela: fora dela a cor lê bem numa tela
     * e some na outra.
     */
    it('keeps every colour legible in both themes', () => {
      for (const color of NOTE_COLORS) {
        const luminance = relativeLuminance(color)
        expect(luminance).toBeGreaterThanOrEqual(LUMINANCE_WINDOW.minimum)
        expect(luminance).toBeLessThanOrEqual(LUMINANCE_WINDOW.maximum)
        for (const background of THEME_BACKGROUNDS) {
          expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(MIN_CONTRAST)
        }
      }
    })

    /** A lista é literal e não se mistura a token: `color-mix` de tom saiu com a spec 121. */
    it('no longer mixes a tone into the stop colour', () => {
      const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')
      const component = readApplicationFile('src/components/ui/cargo-isometric.tsx')

      expect(css).not.toMatch(/^\.noteTone\d+ \{/mu)
      expect(css).not.toContain('color-mix(in srgb, currentColor')
      expect(component).not.toContain('toneClassOf')
      expect(component).not.toContain('CargoToneSwatch')
    })
  })

  describe('a cor de cada nota', () => {
    /** A mesma nota tem a mesma cor em todo redesenho, qualquer que seja a ordem das caixas. */
    it('gives the same colour to the same note whatever order the boxes arrive in', () => {
      const boxes = [box(1, 'c'), box(1, 'a'), box(2, 'x'), box(1, 'b'), box(1, 'a')]
      const shuffled = [boxes[3], boxes[0], boxes[4], boxes[2], boxes[1]].flatMap((entry) =>
        entry === undefined ? [] : [entry],
      )

      expect([...resolveNoteColors(shuffled).entries()].sort()).toEqual(
        [...resolveNoteColors(boxes).entries()].sort(),
      )
    })

    /**
     * ⚠️ **Trocar a ordem das paradas não repinta a carga.** A reordenação da proposta (spec 111) é
     * um clique de seta, e uma cor por posição de parada faria o baú inteiro mudar de cor a cada um.
     */
    it('does not repaint when the stops change places', () => {
      const first = resolveNoteColors([box(1, 'a'), box(2, 'b')])
      const swapped = resolveNoteColors([box(2, 'a'), box(1, 'b')])

      expect(first.get('a')).toBe(swapped.get('a'))
      expect(first.get('b')).toBe(swapped.get('b'))
    })

    /**
     * ⚠️ **Duas notas desenhadas nunca dividem cor enquanto houver cor na lista** — nem dentro da
     * parada, que era o que o tom não conseguia entregar, nem entre paradas.
     */
    it('gives every drawn note a colour of its own, up to the whole palette', () => {
      for (const [stops, notes] of [
        [3, 5],
        [24, 2],
        [85, 1],
        [32, 4],
      ] as const) {
        const boxes = trip3d(stops, notes)
        const colors = resolveNoteColors(boxes)

        expect(colors.size).toBe(stops * notes)
        expect(new Set(colors.values()).size).toBe(stops * notes)
        expect(countNotesSharingColor(colors)).toBe(0)
      }
    })

    /**
     * ⚠️ **Acabando a lista, a repetição é a mais distante possível na ordem, e é contada.** Repetir
     * calado faz a cor deixar de identificar sem ninguém perceber — o defeito que a paleta de paradas
     * já pagou uma vez.
     */
    it('reuses the farthest colour it can and says how many notes had to share', () => {
      const notes = NOTE_COLORS.length + 3
      const boxes = Array.from({ length: notes }, (_unused, index) =>
        box(1, `doc-${String(index).padStart(4, '0')}`),
      )
      const colors = resolveNoteColors(boxes)

      expect(countNotesSharingColor(colors)).toBe(3)
      expect(colors.get('doc-0000')).toBe(colors.get(`doc-${String(notes - 3).padStart(4, '0')}`))
      expect(colors.get('doc-0000')).not.toBe(colors.get('doc-0001'))
    })

    /** Caixa sem nota conhecida volta à cor da parada — `null` é "não se sabe", nunca uma nota. */
    it('falls back to the stop colour for a box without a known note', () => {
      const colors = resolveNoteColors([box(1, 'a'), box(1, null)])

      expect(noteColorOf(colors, box(1, null), stopColorOf(1))).toBe(stopColorOf(1))
      expect(noteColorOf(colors, box(1, 'a'), stopColorOf(1))).toBe(NOTE_COLORS[0] ?? '')
    })

    /** A tela pinta a caixa pela nota, com a cor da parada só como reserva. */
    it('is what the drawing paints the box with', () => {
      const layers = readApplicationFile(
        'src/modules/trip/components/TripCargoLayers.component.tsx',
      )

      expect(layers).toContain('color: noteColorOf(noteColors, box, stopColorOf(box.stopSequence))')
      expect(layers).not.toContain('tone:')
    })
  })

  describe('a parada, sem a cor', () => {
    /**
     * ⚠️ **O disco de cor da parada saiu da ficha da carga.** Com a carga pintada pela nota, ele
     * afirmaria uma cor que o baú não tem em lugar nenhum. O que identifica a parada passou a ser o
     * número da entrega, a lista das notas dela, a divisa entre fatias e o destaque ao clicar.
     */
    it('identifies the stop by its delivery number, its notes, the slice cut and the focus', () => {
      const layers = readApplicationFile(
        'src/modules/trip/components/TripCargoLayers.component.tsx',
      )
      const styles = readApplicationFile('src/modules/trip/styles/trip.module.css')

      expect(layers).not.toContain('cargoStopDot')
      expect(styles).not.toContain('.cargoStopDot {')
      expect(layers).toContain("t('cargoLayers.chip.deliveryOrder', { sequence })")
      expect(layers).toContain('resolveSliceCuts(boxes, arrangement)')
      expect(layers).toContain('toggleCargoStopFocus(previous, sequence)')
      expect(layers).toContain('aria-pressed={focus.stops.has(sequence)}')
    })

    /**
     * ⚠️ **A lista de notas vale também para a parada de uma nota só**, ao contrário da 119, que a
     * escondia por ser repetição do destaque da parada. Hoje ela é o único lugar em que a cor
     * desenhada é nomeada: escondê-la deixava a parada de uma nota — a maioria das reais, medido em
     * 2026-09-10 — com carga colorida e ficha sem cor nenhuma.
     */
    it('lists the notes of every stop, single-note stops included', () => {
      const layers = readApplicationFile(
        'src/modules/trip/components/TripCargoLayers.component.tsx',
      )

      expect(layers).toContain('notesOfStop.length === 0 ? null')
      expect(layers).not.toContain('singleSplitPieces')
      expect(layers).toContain('<CargoNoteSwatch color={note.color} />')
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

    /** A ficha usa botão com `aria-pressed` e os textos existem nos dois idiomas. */
    it('wires the note list to the focus with accessible buttons', () => {
      const layers = readApplicationFile(
        'src/modules/trip/components/TripCargoLayers.component.tsx',
      )

      expect(layers).toContain('aria-pressed={focus.notes.has(note.documentId)}')
      expect(layers).toContain('toggleNoteFocus(previous, note.documentId)')
      expect(layers).toContain('isBoxLit(focus, box)')
      expect(layers).not.toContain('title=')
      for (const locale of [trip, tripEn]) {
        expect(locale.cargoLayers.invoice.listLabel).toBeTruthy()
        expect(locale.cargoLayers.invoice.number).toContain('{{number}}')
        expect(locale.cargoLayers.invoice.toggle).toContain('{{label}}')
        expect(locale.cargoLayers.legend.notes).toBeTruthy()
        expect(locale.cargoLayers.legend.reusedColors).toContain('{{count}}')
      }
    })

    /** Cor repetida sai na legenda, junto das outras marcas do desenho. */
    it('prints the reused-colour notice only when the palette ran out', () => {
      const layers = readApplicationFile(
        'src/modules/trip/components/TripCargoLayers.component.tsx',
      )

      expect(layers).toContain('notesSharingColor === 0 ? null')
      expect(layers).toContain("t('cargoLayers.legend.reusedColors', { count: notesSharingColor })")
    })
  })

  describe('as marcas que não podem virar a mesma coisa', () => {
    /**
     * ⚠️ **A presumida não é a cor lavada**: o preenchimento é da nota, e a lavagem brigaria com ele.
     * A marca é o contorno pontilhado — borda, não face, e nunca hachura.
     */
    it('marks the presumed box by its outline, never by its fill', () => {
      const component = readApplicationFile('src/components/ui/cargo-isometric.tsx')
      const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')

      expect(component).not.toContain('faceWash')
      expect(component).toContain('box.isEstimated && !box.isGhost && styles.facePresumed')
      const presumed = css.match(/\.facePresumed \{([^}]*)\}/u)?.[1] ?? ''
      expect(presumed).toContain('stroke-dasharray')
      expect(presumed).not.toContain('fill')
      expect(trip.cargoLayers.legend.presumed).toContain('pontilhado')
      expect(tripEn.cargoLayers.legend.presumed).toContain('Dotted')
    })

    /**
     * ⚠️ **As três marcas de contorno continuam distintas entre si** (119 e 120): pontilhado curto
     * para a presumida, vermelho para a dividida, cobre mais longo para o complemento. Com a face
     * agora podendo ser qualquer uma das 128 cores, duas marcas com o mesmo traço seriam ilegíveis
     * justamente na caixa que carrega as duas.
     */
    it('keeps the presumed, split and complement outlines telling different stories', () => {
      const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')
      const dashOf = (rule: string): string =>
        css
          .match(new RegExp(`\\.${rule} \\{([^}]*)\\}`, 'u'))?.[1]
          ?.match(/stroke-dasharray: ([^;]+);/u)?.[1] ?? ''

      const dashes = ['facePresumed', 'faceSplit', 'faceComplement'].map(dashOf)
      for (const dash of dashes) expect(dash).not.toBe('')
      expect(new Set(dashes).size).toBe(dashes.length)
      expect(css).toContain('stroke: var(--color-alert)')
      expect(css).toContain('stroke: var(--color-copper)')
    })
  })

  /**
   * Spec 120: `placement.splitNotes` é opcional e a leitura é tolerante — item malformado é
   * ignorado, nunca derruba a planta inteira.
   */
  describe('resolveSplitPieces', () => {
    it('reads documentId and pieces from valid entries', () => {
      const pieces = resolveSplitPieces([
        { documentId: 'a', pieces: 3 },
        { documentId: 'b', pieces: 2 },
      ])

      expect(pieces.get('a')).toBe(3)
      expect(pieces.get('b')).toBe(2)
    })

    it('treats an absent field as an empty list, never an error', () => {
      expect(resolveSplitPieces(undefined).size).toBe(0)
    })

    /** ⚠️ Item malformado é ignorado — não derruba os outros, nem a planta inteira. */
    it('drops a malformed entry without throwing', () => {
      const pieces = resolveSplitPieces([
        { documentId: 'a', pieces: 3 },
        { documentId: 'b' },
        { pieces: 4 },
        'not-an-object',
        { documentId: 'c', pieces: 'two' },
        null,
      ])

      expect([...pieces.entries()]).toEqual([['a', 3]])
    })

    /** Um pedaço só não é "dividida" — a nota inteira não entra na conta. */
    it('ignores an entry whose pieces is not greater than one', () => {
      expect(resolveSplitPieces([{ documentId: 'a', pieces: 1 }]).size).toBe(0)
    })

    it('is not fooled by a value that is not an array at all', () => {
      expect(resolveSplitPieces('not-an-array').size).toBe(0)
      expect(resolveSplitPieces(null).size).toBe(0)
    })
  })

  describe('a lista da ficha', () => {
    /** As notas da parada com a cor e as caixas de cada uma, pelo número impresso. */
    it('lists the notes of each stop with their colour and box count', () => {
      const boxes = [box(1, 'b', '900'), box(1, 'a', '120'), box(1, 'a', '120'), box(1, null)]
      const colors = resolveNoteColors(boxes)
      const notes = buildStopNotes(boxes, colors).get(1) ?? []

      expect(notes.map((note) => note.documentNumber)).toEqual(['120', '900'])
      expect(notes.map((note) => note.boxes)).toEqual([2, 1])
      expect(notes[0]?.color).toBe(colors.get('a'))
      expect(notes[1]?.color).toBe(colors.get('b'))
    })

    /** As notas divididas ganham a contagem de pedaços; as demais não ganham o campo. */
    it('carries the split pieces into the note list, only for the notes that were split', () => {
      const boxes = [box(1, 'a', '100'), box(1, 'b', '200')]
      const notes = buildStopNotes(
        boxes,
        resolveNoteColors(boxes),
        resolveSplitPieces([{ documentId: 'a', pieces: 3 }]),
      ).get(1)

      expect(notes?.find((note) => note.documentId === 'a')?.pieces).toBe(3)
      expect(notes?.find((note) => note.documentId === 'b')?.pieces).toBeUndefined()
    })

    /** O aviso de nota dividida existe nos dois idiomas e mora dentro da lista. */
    it('keeps the split notice inside the list, which every stop now renders', () => {
      const layers = readApplicationFile(
        'src/modules/trip/components/TripCargoLayers.component.tsx',
      )

      expect(layers).toContain("t('cargoLayers.invoice.splitPieces', { pieces: note.pieces })")
      for (const locale of [trip, tripEn]) {
        expect(locale.cargoLayers.invoice.splitPieces).toContain('{{pieces}}')
      }
    })
  })
})
