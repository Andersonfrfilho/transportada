/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 156 T15 A1: `POST .../stops/:stopId/arrive` do escritório passa a aceitar `arrivedAt`
 * opcional — mesma janela de relógio de "Entregue em" (`fieldDeliveryValidation.service.ts`), mas
 * com os códigos de erro próprios que a API usa aqui (`ARRIVED_AT_*`, não `DELIVERED_AT_*`).
 */
export const TRIP_ARRIVED_AT_ERROR = {
  IN_FUTURE: 'ARRIVED_AT_IN_FUTURE',
  BEFORE_DISPATCH: 'ARRIVED_AT_BEFORE_DISPATCH',
} as const

export type TripArrivedAtError = (typeof TRIP_ARRIVED_AT_ERROR)[keyof typeof TRIP_ARRIVED_AT_ERROR]

export type ValidateTripArrivedAtParams = Readonly<{
  arrivedAt: string
  dispatchedAt: null | string
  now: Date
}>

/** Espelha a régua da API para a tela recusar antes da viagem de rede — a API continua decidindo. */
export function validateTripArrivedAt({
  arrivedAt,
  dispatchedAt,
  now,
}: ValidateTripArrivedAtParams): TripArrivedAtError | undefined {
  const arrivedAtTime = new Date(arrivedAt).getTime()
  if (Number.isNaN(arrivedAtTime) || arrivedAtTime > now.getTime()) {
    return TRIP_ARRIVED_AT_ERROR.IN_FUTURE
  }
  if (dispatchedAt === null) return undefined

  const dispatchedAtTime = new Date(dispatchedAt).getTime()
  if (!Number.isNaN(dispatchedAtTime) && arrivedAtTime < dispatchedAtTime) {
    return TRIP_ARRIVED_AT_ERROR.BEFORE_DISPATCH
  }
  return undefined
}

/** `new Date('').toISOString()` lança — texto inválido (campo vazio) volta cru (A4b, mesma régua). */
export function resolveTripArrivedAtIso(arrivedAt: string): string {
  const date = new Date(arrivedAt)
  return Number.isNaN(date.getTime()) ? arrivedAt : date.toISOString()
}

/** `<input type="datetime-local">` quer `AAAA-MM-DDTHH:mm`, sem fuso — mesmo formato em toda a app. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
