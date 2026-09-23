/* Copyright (c) 2026 Ada Technology. MIT License. */
import { toMillimetres } from '@/modules/nfe-workspace/shared/packageBoxMeasurementUnits.service'

export type PendingMeasurementDimensionKey = 'height' | 'length' | 'width'

/** Um valor em centímetro por campo, como o operador está digitando — nunca os três de uma vez. */
export type PendingMeasurementDraft = Readonly<
  Partial<Record<PendingMeasurementDimensionKey, string>>
>

export type PendingMeasurementSubmission =
  | Readonly<{ heightMm: number; lengthMm: number; ready: true; widthMm: number }>
  | Readonly<{ ready: false }>

/**
 * Spec 168 (RF02, RF05, CA01, CA03): grava só com os três campos preenchidos — incompleto não
 * reclama, é o operador ainda digitando. Fora de faixa (a mesma política da fila,
 * `packageBoxMeasurementUnits.service.ts`) também não grava; a mensagem por campo é responsabilidade
 * de quem desenha a linha, não desta função.
 */
export function resolvePendingMeasurementSubmission(
  draft: PendingMeasurementDraft,
): PendingMeasurementSubmission {
  const { height, length, width } = draft
  if (!height?.trim() || !length?.trim() || !width?.trim()) return { ready: false }

  const heightMm = toMillimetres(height, 'heightMm')
  const lengthMm = toMillimetres(length, 'lengthMm')
  const widthMm = toMillimetres(width, 'widthMm')
  if (heightMm === null || lengthMm === null || widthMm === null) return { ready: false }

  return { heightMm, lengthMm, ready: true, widthMm }
}
