/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoBedDimensions } from './cargo-layout.policy.js'

const MILLIMETRES_PER_METRE = 1000
/**
 * Teto de caixas desenhadas. Uma viagem de 300 notas pode ter milhares, e o desenho não fica melhor
 * com duas mil — fica lento e ilegível. O excedente é dito, como tudo que não entra.
 */
const MAX_PLACED_BOXES = 600

/**
 * O porquê de cada caixa estar onde está. **Vocabulário fechado**: motivo que a política não conhece
 * não vira texto livre, ele não existe.
 *
 * ⚠️ É o motivo que separa um desenho de uma instrução. Sem ele o operador vê uma arrumação e não
 * tem como discordar dela — e discordar é o que ele faz melhor que o algoritmo, porque viu a carga.
 */
export const PLACEMENT_REASONS = [
  'lastStopFirst',
  'fragileOnTop',
  'notStackable',
  'keepUpright',
  'estimatedBox',
  'axleNotChecked',
] as const
export type PlacementReason = (typeof PLACEMENT_REASONS)[number]

/** Por que uma caixa ficou de fora. Nomear é obrigatório — sumir com ela, nunca. */
export const UNPLACED_REASONS = ['notMeasured', 'largerThanBed', 'bedFull', 'tooMany'] as const
export type UnplacedReason = (typeof UNPLACED_REASONS)[number]

export type PlacementBox = {
  readonly count: number
  readonly heightMm: number | null
  /** `null` é "ninguém informou", nunca "pode": o nulo empilha e marca o arranjo como presumido. */
  readonly isFragile: boolean | null
  readonly isStackable: boolean | null
  readonly keepUpright: boolean | null
  readonly label: string
  readonly lengthMm: number | null
  readonly maxStackCount: number | null
  readonly source: 'measured' | 'estimated'
  readonly stopSequence: number
  readonly widthMm: number | null
}

export type PlacedBox = {
  readonly depthM: number
  readonly heightM: number
  readonly isFragile: boolean
  readonly label: string
  readonly layer: number
  readonly reasons: readonly PlacementReason[]
  readonly source: 'measured' | 'estimated'
  readonly stopSequence: number
  readonly widthM: number
  /** Distância do fundo do baú (0 é encostado na cabine). */
  readonly xM: number
  /** Distância da parede lateral. */
  readonly yM: number
}

export type UnplacedBox = {
  readonly count: number
  readonly label: string
  readonly reason: UnplacedReason
}

export type CargoPlacementLayer = {
  readonly boxes: readonly PlacedBox[]
  readonly heightM: number
  readonly index: number
}

export type CargoPlacement = {
  readonly layers: readonly CargoPlacementLayer[]
  /**
   * A pior origem manda, como no volume e no peso: uma caixa presumida — ou uma restrição que
   * ninguém informou — torna presumido o arranjo inteiro. Quem carrega decide pelo pior caso.
   */
  readonly source: 'measured' | 'estimated'
  readonly unplaced: readonly UnplacedBox[]
}

type Slot = {
  readonly depthM: number
  readonly heightM: number
  readonly widthM: number
}

/**
 * Spec 094: **onde cada caixa cabe**, camada por camada.
 *
 * A varredura é em fileiras: enche o piso ao longo do comprimento, quebra para a fileira ao lado
 * quando a largura acaba, e sobe para a camada seguinte quando o piso acaba. Não é empacotamento
 * ótimo — isso é NP-difícil, e a diferença não paga o tempo de resposta numa tela de montagem.
 *
 * ⚠️ **A promessa é "cabe", não "deve ir assim".** A planta respeita o que está informado e declara
 * o que não está: sem peso por eixo ela nunca diz que a carga pode sair, e sem `is_stackable` ela
 * empilha marcando o arranjo como presumido.
 *
 * ⚠️ **A última parada viaja no fundo.** Carga da primeira parada atrás da carga da terceira obriga
 * a descarregar tudo para entregar a primeira.
 */
export function resolveCargoPlacement(input: {
  readonly bed: CargoBedDimensions | null
  readonly boxes: readonly PlacementBox[]
}): CargoPlacement | null {
  if (input.bed === null) return null

  const bed = {
    heightM: Number.parseFloat(input.bed.heightM),
    lengthM: Number.parseFloat(input.bed.lengthM),
    widthM: Number.parseFloat(input.bed.widthM),
  }
  if (bed.heightM <= 0 || bed.lengthM <= 0 || bed.widthM <= 0) return null

  const unplaced: UnplacedBox[] = []
  const measured = input.boxes.filter((box) => {
    if (box.heightMm !== null && box.lengthMm !== null && box.widthMm !== null) return true
    /** Caixa sem medida não entra: posição de palpite é o que a spec 085 recusou por escrito. */
    unplaced.push({ count: box.count, label: box.label, reason: 'notMeasured' })
    return false
  })

  /**
   * ⚠️ Frágil e não empilhável vão **por último**, para ficarem na camada de cima. É a única
   * garantia que uma heurística de camadas consegue dar sem virar empacotamento com restrição.
   */
  const ordered = [...measured].sort((first, second) => {
    const byTop = rankTopOnly(first) - rankTopOnly(second)
    if (byTop !== 0) return byTop
    /** Depois, a última parada primeiro: ela viaja no fundo. */
    return second.stopSequence - first.stopSequence
  })

  const layers: CargoPlacementLayer[] = []
  let cursor = { layerBottomM: 0, layerHeightM: 0, rowWidthM: 0, xM: 0, yM: 0 }
  let current: PlacedBox[] = []
  let placedCount = 0
  let presumed = false

  const closeLayer = (): void => {
    if (current.length > 0) {
      layers.push({ boxes: current, heightM: cursor.layerHeightM, index: layers.length })
    }
    current = []
    cursor = {
      layerBottomM: cursor.layerBottomM + cursor.layerHeightM,
      layerHeightM: 0,
      rowWidthM: 0,
      xM: 0,
      yM: 0,
    }
  }

  for (const box of ordered) {
    const stackLimit = resolveStackLimit(box)
    if (box.isStackable === null || box.isFragile === null) presumed = true
    if (box.source === 'estimated') presumed = true

    for (let unit = 0; unit < box.count; unit += 1) {
      const slot = fitSlot({ bed, box })
      if (slot === null) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'largerThanBed' })
        break
      }
      if (placedCount >= MAX_PLACED_BOXES) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'tooMany' })
        continue
      }
      if (cursor.xM + slot.depthM > bed.lengthM + 1e-9) {
        cursor = { ...cursor, rowWidthM: 0, xM: 0, yM: cursor.yM + cursor.rowWidthM }
      }
      if (cursor.yM + slot.widthM > bed.widthM + 1e-9) {
        closeLayer()
      }
      /**
       * ⚠️ O limite de pilha é conferido **depois** de a camada eventualmente fechar. Antes dele, a
       * caixa que provocava o fechamento escapava para a camada de cima — e uma caixa declarada não
       * empilhável acabava empilhada, que é o oposto do que o campo diz.
       */
      if (layers.length >= stackLimit) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
        continue
      }
      if (cursor.layerBottomM + slot.heightM > bed.heightM + 1e-9) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
        continue
      }

      current.push({
        depthM: round(slot.depthM),
        heightM: round(slot.heightM),
        isFragile: box.isFragile === true,
        label: box.label,
        layer: layers.length,
        reasons: resolveReasons(box),
        source: box.source,
        stopSequence: box.stopSequence,
        widthM: round(slot.widthM),
        xM: round(cursor.xM),
        yM: round(cursor.yM),
      })
      placedCount += 1
      cursor = {
        ...cursor,
        layerHeightM: Math.max(cursor.layerHeightM, slot.heightM),
        rowWidthM: Math.max(cursor.rowWidthM, slot.widthM),
        xM: cursor.xM + slot.depthM,
      }
    }
  }
  closeLayer()

  return { layers, source: presumed ? 'estimated' : 'measured', unplaced }
}

/**
 * Quantas camadas esta caixa aceita ter **abaixo** dela. Zero é "só o piso": não empilhável e frágil
 * ficam por cima, e sem informação a caixa empilha à vontade — marcando o arranjo como presumido.
 */
function resolveStackLimit(box: PlacementBox): number {
  if (box.isStackable === false || box.isFragile === true) return 1
  return box.maxStackCount ?? Number.POSITIVE_INFINITY
}

/** Frágil e não empilhável entram por último, para caírem na camada de cima. */
function rankTopOnly(box: PlacementBox): number {
  return box.isFragile === true || box.isStackable === false ? 1 : 0
}

/**
 * A caixa no plano, com as duas orientações. Girar em torno do eixo vertical é sempre permitido — é
 * o mesmo lado no chão; `keepUpright` proíbe **deitar**, que é usar a altura como base, e confundir
 * os dois faria a planta recusar caixa que cabe perfeitamente virada.
 */
function fitSlot(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly box: PlacementBox
}): Slot | null {
  const lengthM = (input.box.lengthMm ?? 0) / MILLIMETRES_PER_METRE
  const widthM = (input.box.widthMm ?? 0) / MILLIMETRES_PER_METRE
  const heightM = (input.box.heightMm ?? 0) / MILLIMETRES_PER_METRE
  if (heightM > input.bed.heightM) return null

  const orientations: readonly Slot[] = [
    { depthM: lengthM, heightM, widthM },
    { depthM: widthM, heightM, widthM: lengthM },
  ]

  return (
    orientations.find(
      (slot) => slot.depthM <= input.bed.lengthM && slot.widthM <= input.bed.widthM,
    ) ?? null
  )
}

function resolveReasons(box: PlacementBox): readonly PlacementReason[] {
  const reasons: PlacementReason[] = ['lastStopFirst']
  if (box.isFragile === true) reasons.push('fragileOnTop')
  if (box.isStackable === false) reasons.push('notStackable')
  if (box.keepUpright === true) reasons.push('keepUpright')
  if (box.source === 'estimated') reasons.push('estimatedBox')

  return reasons
}

/** Uma linha por motivo e por rótulo: dez caixas iguais fora não viram dez avisos. */
function pushUnplaced(list: UnplacedBox[], entry: UnplacedBox): void {
  const existing = list.find((item) => item.label === entry.label && item.reason === entry.reason)
  if (existing === undefined) {
    list.push(entry)
    return
  }
  list.splice(list.indexOf(existing), 1, { ...existing, count: existing.count + entry.count })
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
