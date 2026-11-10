/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320: o relato do app cujo toque não é do dia em que chega fica retido para o escritório.
 * Regra pura, sem I/O. O servidor é quem decide: o PWA instalado pode ser um build antigo.
 *
 * Retém quando o dia do toque (já corrigido pelo relógio, spec 234) é diferente do dia do recebimento, no fuso da
 * empresa, **e** passaram mais que a tolerância entre os dois. Sem `tappedAt` não há o que comparar: não retém, o
 * comportamento de hoje (cliente antigo).
 */
export const FIELD_REPORT_HOLD_TOLERANCE_MS = 3 * 60 * 60 * 1000
export const FIELD_REPORT_HOLD_TIME_ZONE = 'America/Sao_Paulo'

/** Mesmo limite da spec 234: relógio corrigido além disto no futuro é lixo e a correção é descartada. */
const MAXIMUM_FUTURE_SKEW_MS = 2 * 60 * 1000

export type FieldReportHoldInput = {
  readonly clockOffsetMs?: number | undefined
  readonly receivedAt: Date
  readonly tappedAt?: Date | undefined
  readonly timeZone?: string | undefined
  readonly toleranceMs?: number | undefined
}

export type FieldReportHoldDecision =
  | { readonly hold: false }
  | { readonly hold: true; readonly occurredAt: Date; readonly delayMs: number }

export function resolveFieldReportHold(input: FieldReportHoldInput): FieldReportHoldDecision {
  const { tappedAt } = input
  if (tappedAt === undefined || Number.isNaN(tappedAt.getTime())) return { hold: false }

  const occurredAt = resolveOccurredAt({ ...input, tappedAt })
  const delayMs = input.receivedAt.getTime() - occurredAt.getTime()
  if (delayMs <= (input.toleranceMs ?? FIELD_REPORT_HOLD_TOLERANCE_MS)) return { hold: false }

  const timeZone = input.timeZone ?? FIELD_REPORT_HOLD_TIME_ZONE
  if (localDay(occurredAt, timeZone) === localDay(input.receivedAt, timeZone))
    return { hold: false }

  return { delayMs, hold: true, occurredAt }
}

function resolveOccurredAt(input: FieldReportHoldInput & { readonly tappedAt: Date }): Date {
  if (input.clockOffsetMs === undefined) return input.tappedAt
  const corrected = new Date(input.tappedAt.getTime() + input.clockOffsetMs)
  if (corrected.getTime() > input.receivedAt.getTime() + MAXIMUM_FUTURE_SKEW_MS)
    return input.tappedAt

  return corrected
}

function localDay(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(moment)
}
