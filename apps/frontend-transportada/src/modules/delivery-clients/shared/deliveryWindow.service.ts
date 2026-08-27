/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryWindow } from './deliveryClients.types'

/**
 * A janela é **lista**, e o editor mexe nela por dia: o cliente que recebe 8h–11h e 14h–16h tem o
 * almoço fechado no meio, e é esse buraco que duas colunas não representariam.
 */
export function windowsOfWeekday(
  windows: readonly DeliveryWindow[],
  weekday: number,
): readonly DeliveryWindow[] {
  return windows
    .filter((window) => window.weekday === weekday)
    .toSorted((left, right) => left.opensAt.localeCompare(right.opensAt))
}

export function addWindow(
  windows: readonly DeliveryWindow[],
  weekday: number,
): readonly DeliveryWindow[] {
  return [...windows, { closesAt: '18:00', opensAt: '08:00', weekday }]
}

export function removeWindow(
  windows: readonly DeliveryWindow[],
  target: DeliveryWindow,
): readonly DeliveryWindow[] {
  const index = windows.findIndex(
    (window) =>
      window.weekday === target.weekday &&
      window.opensAt === target.opensAt &&
      window.closesAt === target.closesAt,
  )
  return index === -1 ? windows : [...windows.slice(0, index), ...windows.slice(index + 1)]
}

export function changeWindow(
  windows: readonly DeliveryWindow[],
  input: Readonly<{ field: 'closesAt' | 'opensAt'; target: DeliveryWindow; value: string }>,
): readonly DeliveryWindow[] {
  return windows.map((window) =>
    window === input.target ? { ...window, [input.field]: input.value } : window,
  )
}

/**
 * A janela invertida morre aqui, e não no CHECK do banco: o operador vê o erro no campo em vez de
 * um 500 com nome de constraint. Vazia é válida — é o cliente que não recebe naquele dia.
 */
export function findInvalidWindow(
  windows: readonly DeliveryWindow[],
): DeliveryWindow | undefined {
  return windows.find((window) => window.opensAt >= window.closesAt)
}

/** `08:00:00` do banco e `08:00` da tela são o mesmo horário — o campo mostra o segundo. */
export function toTimeInputValue(time: string): string {
  return time.slice(0, 5)
}
