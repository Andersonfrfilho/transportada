/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 T13 (D4): a planta nova chega animada — a caixa que sai esmaece, a que muda de lugar
 * desliza e a nova surge esmaecendo. Funções puras; o relógio mora em `useCargoLayoutTransition`.
 */
import { CARGO_LAYOUT_TRANSITION_MAX_BOXES } from './trip.constant'
import type { TripCargoLayout, TripPlacedBox } from './trip.types'

export type CargoBoxPosition = Readonly<{ xM: number; yM: number; zM: number }>

export type CargoBoxAppearance = 'entering' | 'leaving'

export type CargoLayoutTransitionPlan = Readonly<{
  entering: ReadonlySet<string>
  leaving: readonly Readonly<{ box: TripPlacedBox; key: string }>[]
  /** A posição na planta anterior de cada caixa que continua na nova. */
  origins: ReadonlyMap<string, CargoBoxPosition>
}>

/** `progress` já suavizado, de 0 a 1. */
export type CargoLayoutTransitionFrame = Readonly<{
  plan: CargoLayoutTransitionPlan
  progress: number
}>

const DIMENSION_DIGITS = 3

/**
 * ⚠️ **A planta não traz id de caixa.** A identidade é a nota (ou a parada, quando a caixa não tem
 * nota), a medida sem giro e o ordinal entre as iguais. Duas caixas iguais da mesma nota trocando de
 * lugar desenham o mesmo quadro, e a caixa girada continua sendo ela.
 */
export function listCargoBoxMatchKeys(boxes: readonly TripPlacedBox[]): readonly string[] {
  const seen = new Map<string, number>()
  return boxes.map((box) => {
    const owner = box.documentId ?? `stop-${String(box.stopSequence)}`
    const size = [box.depthM, box.widthM, box.heightM]
      .map((value) => value.toFixed(DIMENSION_DIGITS))
      .sort()
      .join('x')
    const base = `${owner}|${size}`
    const ordinal = seen.get(base) ?? 0
    seen.set(base, ordinal + 1)
    return `${base}|${String(ordinal)}`
  })
}

/** Na mesma ordem em que a planta desenha: camada por camada. */
export function flattenPlacedBoxes(layout: TripCargoLayout | null): readonly TripPlacedBox[] {
  return layout?.placement?.layers.flatMap((layer) => layer.boxes) ?? []
}

export function planCargoLayoutTransition(
  input: Readonly<{ next: readonly TripPlacedBox[]; previous: readonly TripPlacedBox[] }>,
): CargoLayoutTransitionPlan {
  const previousKeys = listCargoBoxMatchKeys(input.previous)
  const nextKeys = new Set(listCargoBoxMatchKeys(input.next))
  const origins = new Map<string, CargoBoxPosition>()
  const leaving: Readonly<{ box: TripPlacedBox; key: string }>[] = []

  input.previous.forEach((box, index) => {
    const key = previousKeys[index] ?? ''
    if (nextKeys.has(key)) origins.set(key, { xM: box.xM, yM: box.yM, zM: box.zM })
    else leaving.push({ box, key })
  })

  const entering = new Set([...nextKeys].filter((key) => !origins.has(key)))
  return { entering, leaving, origins }
}

/** Entra e sai devagar: um deslize linear lê como salto no primeiro quadro. */
export function easeCargoTransition(progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1)
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2
}

/**
 * ⚠️ Acima do teto a troca é direta: cada quadro reprojeta a carga inteira, e numa planta de
 * milhares de caixas o deslize travaria a tela que ele devia suavizar.
 */
export function shouldAnimateCargoLayout(
  input: Readonly<{ boxCount: number; prefersReducedMotion: boolean }>,
): boolean {
  if (input.prefersReducedMotion) return false
  return input.boxCount <= CARGO_LAYOUT_TRANSITION_MAX_BOXES
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

/** Sem quadro, a lista volta intacta — a mesma referência, para a memória do desenho valer. */
export function applyCargoLayoutTransition<TBox extends CargoBoxPosition>(
  input: Readonly<{
    boxes: readonly TBox[]
    frame: CargoLayoutTransitionFrame | null
    keys: readonly string[]
    toLeaving: (box: TripPlacedBox, key: string) => TBox
  }>,
): readonly (TBox & Readonly<{ appearance?: CargoBoxAppearance }>)[] {
  const { frame } = input
  if (frame === null) return input.boxes

  const drawn = input.boxes.map((box, index) => {
    const key = input.keys[index] ?? ''
    if (frame.plan.entering.has(key)) return { ...box, appearance: 'entering' as const }
    const origin = frame.plan.origins.get(key)
    if (origin === undefined) return box
    return {
      ...box,
      xM: interpolate(origin.xM, box.xM, frame.progress),
      yM: interpolate(origin.yM, box.yM, frame.progress),
      zM: interpolate(origin.zM, box.zM, frame.progress),
    }
  })
  const leaving = frame.plan.leaving.map(({ box, key }) => ({
    ...input.toLeaving(box, key),
    appearance: 'leaving' as const,
  }))
  return [...drawn, ...leaving]
}
