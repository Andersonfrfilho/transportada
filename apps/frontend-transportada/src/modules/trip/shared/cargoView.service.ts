/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ViewAngle } from '@/components/ui/cargo-isometric'

/** A vista do baú: para onde se olha, para onde se deslocou e com que aproximação. */
export type CargoView = Readonly<{
  angle: ViewAngle
  panX: number
  panY: number
  zoom: number
}>

export type CargoViewPreset = 'default' | 'rear' | 'side' | 'top'

export const DEFAULT_CARGO_VIEW: CargoView = {
  angle: { pitchRad: 0.62, yawRad: -0.62 },
  panX: 0,
  panY: 0,
  zoom: 1,
}

/**
 * Os atalhos de vista.
 *
 * ⚠️ Giro **zero olha a lateral**, não a traseira: o comprimento do baú corre no eixo `x`, e é ele
 * que fica de frente sem giro nenhum. Trocar os dois é o erro natural, e ele produz dois botões que
 * mostram o contrário do que o rótulo promete.
 *
 * ⚠️ A lateral é meia volta, não giro zero: a **porta lateral** fica no plano `y = 0`, e sem giro
 * quem aparece é a parede oposta — a lateral cega.
 */
const PRESET_ANGLES: Readonly<Record<CargoViewPreset, ViewAngle>> = {
  default: DEFAULT_CARGO_VIEW.angle,
  rear: { pitchRad: 0.25, yawRad: -Math.PI / 2 },
  side: { pitchRad: 0.25, yawRad: Math.PI },
  top: { pitchRad: 1.4, yawRad: -0.62 },
}

/** Um passo de giro pelos botões: 15°, o suficiente para ver a mudança sem perder a referência. */
const ROTATION_STEP_RAD = Math.PI / 12
/** O passo de deslocamento, em fração do desenho. */
const PAN_STEP = 0.5
const ZOOM_STEP = 0.2
const ZOOM_RANGE = { max: 3, min: 0.5 } as const
/**
 * O tombo trava antes da horizontal e antes do zênite: passar de 90° inverte a face horizontal e o
 * desenho fica de cabeça para baixo sem que ninguém tenha pedido isso.
 */
const PITCH_RANGE = { max: 1.45, min: -0.2 } as const

export function applyViewPreset(view: CargoView, preset: CargoViewPreset): CargoView {
  return { ...view, angle: PRESET_ANGLES[preset] }
}

export function rotateView(
  view: CargoView,
  direction: 'down' | 'left' | 'right' | 'up',
): CargoView {
  const yawRad =
    view.angle.yawRad +
    (direction === 'left' ? -ROTATION_STEP_RAD : direction === 'right' ? ROTATION_STEP_RAD : 0)
  const pitchRad =
    view.angle.pitchRad +
    (direction === 'up' ? ROTATION_STEP_RAD : direction === 'down' ? -ROTATION_STEP_RAD : 0)

  return { ...view, angle: { pitchRad: clamp(pitchRad, PITCH_RANGE), yawRad } }
}

/** O arrasto gira: horizontal é volta, vertical é tombo — e o tombo respeita o mesmo limite. */
export function dragView(view: CargoView, delta: Readonly<{ x: number; y: number }>): CargoView {
  return {
    ...view,
    angle: {
      pitchRad: clamp(view.angle.pitchRad - delta.y * 0.01, PITCH_RANGE),
      yawRad: view.angle.yawRad + delta.x * 0.01,
    },
  }
}

export function panViewBy(view: CargoView, direction: 'down' | 'left' | 'right' | 'up'): CargoView {
  return {
    ...view,
    panX: view.panX + (direction === 'left' ? -PAN_STEP : direction === 'right' ? PAN_STEP : 0),
    panY: view.panY + (direction === 'up' ? -PAN_STEP : direction === 'down' ? PAN_STEP : 0),
  }
}

export function zoomViewBy(view: CargoView, step: number): CargoView {
  return { ...view, zoom: clamp(view.zoom + step * ZOOM_STEP, ZOOM_RANGE) }
}

function clamp(value: number, range: Readonly<{ max: number; min: number }>): number {
  return Math.min(range.max, Math.max(range.min, value))
}
