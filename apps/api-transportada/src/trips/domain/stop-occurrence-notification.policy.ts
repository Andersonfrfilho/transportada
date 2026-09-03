/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 D8: qual template avisa cada motivo de ocorrência de parada.
 *
 * O motorista nunca escreve o aviso — o texto é o template da transportadora, escolhido pelo
 * motivo tipado. O mapa é **parcial de propósito**: motivo sem template configurado grava a
 * ocorrência e segue, sem aviso e sem erro. `other` fica de fora porque motivo livre não tem
 * texto fixo que preste.
 */
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import { NOTIFICATION_TEMPLATE_KEY } from '../../notification/domain/notification-catalog.constant.js'
import type { NotificationTemplateKey } from '../../notification/domain/notification-catalog.constant.js'

const TEMPLATE_KEY_BY_KIND: Partial<Record<TripStopOccurrenceKind, NotificationTemplateKey>> = {
  appointment_required: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_APPOINTMENT_REQUIRED,
  dock_closed: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_DOCK_CLOSED,
  long_wait: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_LONG_WAIT,
  unexpected_charge: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_UNEXPECTED_CHARGE,
}

/** `null` é ausência de aviso, nunca falha: a ocorrência já está gravada quando isto decide. */
export function resolveStopOccurrenceTemplateKey(kind: string): null | NotificationTemplateKey {
  return TEMPLATE_KEY_BY_KIND[kind as TripStopOccurrenceKind] ?? null
}
