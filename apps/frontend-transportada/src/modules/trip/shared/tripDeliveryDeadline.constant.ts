/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TRIP_DELIVERY_DEADLINE_KEYS_BY_STATE } from './trip.constant'

type DeliveryDeadlineState = keyof typeof TRIP_DELIVERY_DEADLINE_KEYS_BY_STATE

/** Spec 236 RF6: as cinco opções do filtro, na ordem em que a tela as oferece e a URL as escreve. */
export const DELIVERY_DEADLINE_FILTER_VALUES = [
  'overdue',
  'due_today',
  'on_time',
  'delivered',
  'none',
] as const

export type DeliveryDeadlineFilterValue = (typeof DELIVERY_DEADLINE_FILTER_VALUES)[number]

/** Entregue no prazo e entregue com atraso são a mesma pergunta do operador: "o que já saiu?". */
export const DELIVERY_DEADLINE_FILTER_VALUE_BY_STATE = {
  delivered_late: 'delivered',
  delivered_on_time: 'delivered',
  due_today: 'due_today',
  on_time: 'on_time',
  overdue: 'overdue',
} as const satisfies Record<DeliveryDeadlineState, DeliveryDeadlineFilterValue>

export type DeliveryDeadlineTone = 'alert' | 'neutral' | 'success' | 'warning'

/** Cor sempre acompanha texto; o tom só diz o quanto o estado pede atenção. */
export const DELIVERY_DEADLINE_TONE_BY_STATE = {
  delivered_late: 'warning',
  delivered_on_time: 'success',
  due_today: 'warning',
  on_time: 'neutral',
  overdue: 'alert',
} as const satisfies Record<DeliveryDeadlineState, DeliveryDeadlineTone>

export const DELIVERY_DEADLINE_FILTER_PARAMETER = 'deadline'
export const DELIVERY_DEADLINE_FILTER_SEPARATOR = ','
export const DELIVERY_DEADLINE_LABEL_PREFIX = 'deliveryDeadline.label'
export const DELIVERY_DEADLINE_ENGLISH_LANGUAGE = 'en'
