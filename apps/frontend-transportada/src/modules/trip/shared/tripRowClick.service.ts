/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Quem é interativo cuida do próprio clique: a linha não pode abrir a viagem por cima dele. */
export const INTERACTIVE_ELEMENT_SELECTOR =
  'button, a, input, label, select, textarea, [role="button"], [role="checkbox"], [role="switch"]'

const PRIMARY_MOUSE_BUTTON = 0

export type TripRowClickParams = Readonly<{
  targetIsInteractive: boolean
  hasTextSelection: boolean
  button: number
  hasModifierKey: boolean
}>

export function shouldOpenTripFromRowClick(params: TripRowClickParams): boolean {
  if (params.targetIsInteractive) return false
  if (params.hasTextSelection) return false
  if (params.button !== PRIMARY_MOUSE_BUTTON) return false
  return !params.hasModifierKey
}
