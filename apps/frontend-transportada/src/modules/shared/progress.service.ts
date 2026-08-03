/* Copyright (c) 2026 Ada Technology. MIT License. */

/** A barra é lida por gente e por leitor de tela: sempre inteiro, sempre entre 0 e 100. */
export function resolveProgressPercent(
  input: Readonly<{ completed: number; total: number }>,
): number {
  if (input.total <= 0) return 0
  const ratio = input.completed / input.total
  if (ratio <= 0) return 0
  if (ratio >= 1) return 100

  return Math.round(ratio * 100)
}
