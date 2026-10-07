/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const DELIVERY_DEADLINE_STATE = {
  DELIVERED_LATE: 'delivered_late',
  DELIVERED_ON_TIME: 'delivered_on_time',
  DUE_TODAY: 'due_today',
  NOT_APPLICABLE: 'not_applicable',
  ON_TIME: 'on_time',
  OVERDUE: 'overdue',
} as const

export const DELIVERY_OUTCOME_KIND = {
  CANCELLED: 'cancelled',
  DELIVERED: 'delivered',
  PENDING: 'pending',
  RELEASED: 'released',
  RETURNED: 'returned',
  RETURNED_TO_CONTRACTOR: 'returned_to_contractor',
} as const

export const DELIVERY_DEADLINE_NOT_APPLICABLE_REASON = {
  CANCELLED: 'cancelled',
  NO_ARRIVAL: 'no_arrival',
  NO_DEADLINE: 'no_deadline',
  NO_DESTINATION_CITY: 'no_destination_city',
  RELEASED: 'released',
  RETURNED: 'returned',
  RETURNED_TO_CONTRACTOR: 'returned_to_contractor',
} as const
