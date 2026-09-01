/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve — o bundle não carrega código de lá. */
export type DeliveryClientStatus = 'active' | 'inactive'

export type DeliveryClient = Readonly<{
  defaultServiceTimeMinutes: number | null
  /** Expectativa, não fato. `null` é ausência de regra, e é o caso da maioria. */
  deliveryFeeAmount: string | null
  displayName: string
  id: string
  notes: string
  requiresScheduling: boolean
  status: DeliveryClientStatus
  taxId: string
}>

export type DeliveryWindow = Readonly<{
  closesAt: string
  opensAt: string
  /** 0 domingo … 6 sábado — a numeração do Postgres, e a mesma da coluna. */
  weekday: number
}>

export type DeliveryException = Readonly<{
  closesAt: string | null
  exceptionOn: string
  kind: 'closed' | 'open'
  opensAt: string | null
}>

export type DeliveryClientDetail = DeliveryClient &
  Readonly<{
    exceptions: readonly DeliveryException[]
    windows: readonly DeliveryWindow[]
  }>

export type DeliveryClientPage = Readonly<{
  items: readonly DeliveryClient[]
  nextCursor: string | null
}>

export type DeliveryClientFilters = Readonly<{
  nameContains: string
  requiresScheduling: boolean | null
  status: DeliveryClientStatus | null
}>

export type DeliveryClientWrite = Readonly<{
  defaultServiceTimeMinutes?: number | null
  deliveryFeeAmount?: string | null
  displayName?: string
  notes?: string
  requiresScheduling?: boolean
  status?: DeliveryClientStatus
}>

export const DELIVERY_CLIENTS_PATH = '/delivery-clients'

export const DELIVERY_CLIENTS_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

/** Domingo primeiro, como o Postgres numera e como o calendário brasileiro é impresso. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const
