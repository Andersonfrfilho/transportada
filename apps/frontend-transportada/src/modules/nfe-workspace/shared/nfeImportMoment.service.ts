/* Copyright (c) 2026 Ada Technology. MIT License. */
const executionMomentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export function formatNfeImportMoment(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return executionMomentFormatter.format(new Date(parsed))
}
