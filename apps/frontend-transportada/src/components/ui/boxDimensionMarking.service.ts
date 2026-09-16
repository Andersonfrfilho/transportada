/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Point } from './boxDimensionGeometry.service'

/** Porta o `marking.ts` do spike: aritmética pura de arrastar/nudgear um ponto sobre o vídeo. */
export type MarkingBounds = Readonly<{ width: number; height: number }>

/** Passo do teclado: 1 px no toque normal, 8 px com Shift — para corrigir rápido sem soltar o dedo. */
export const ARROW_KEY_STEP_PX = 1
export const ARROW_KEY_STEP_PX_FAST = 8

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
export type ArrowKey = (typeof ARROW_KEYS)[number]

export function isArrowKey(key: string): key is ArrowKey {
  return (ARROW_KEYS as readonly string[]).includes(key)
}

const ARROW_KEY_DELTA: Readonly<Record<ArrowKey, Point>> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
}

/** O ponto nunca sai do quadro — arrastar ou nudgear além da borda prende no limite. */
export function clampPointToBounds(point: Point, bounds: MarkingBounds): Point {
  return {
    x: Math.min(Math.max(point.x, 0), bounds.width),
    y: Math.min(Math.max(point.y, 0), bounds.height),
  }
}

export function nudgePoint(
  point: Point,
  key: ArrowKey,
  bounds: MarkingBounds,
  fast: boolean,
): Point {
  const step = fast ? ARROW_KEY_STEP_PX_FAST : ARROW_KEY_STEP_PX
  const delta = ARROW_KEY_DELTA[key]
  return clampPointToBounds({ x: point.x + delta.x * step, y: point.y + delta.y * step }, bounds)
}

/** Lupa quadrada centrada no ponto: ajuda a soltar o dedo exatamente no canto, não ao lado dele. */
export const MAGNIFIER_SIZE_PX = 96
export const MAGNIFIER_ZOOM = 3

export type MagnifierViewport = Readonly<{ x: number; y: number; size: number; zoom: number }>

export function magnifierViewportFor(point: Point, bounds: MarkingBounds): MagnifierViewport {
  const size = MAGNIFIER_SIZE_PX / MAGNIFIER_ZOOM
  const half = size / 2
  return {
    size,
    x: Math.min(Math.max(point.x - half, 0), Math.max(bounds.width - size, 0)),
    y: Math.min(Math.max(point.y - half, 0), Math.max(bounds.height - size, 0)),
    zoom: MAGNIFIER_ZOOM,
  }
}
