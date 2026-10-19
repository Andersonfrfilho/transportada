/* Copyright (c) 2026 Ada Technology. MIT License. */
import { buildTripOccurrenceRoute } from '@/modules/trip/shared/tripOccurrenceRoute.service'
import { buildTripRoute } from '@/modules/trip/shared/tripRoute.service'

export type NotificationTarget = Readonly<{
  href: string
  workspace: 'trip' | 'trip-occurrences'
}>

/** O pacote não exporta `NotificationSummary`; o resolvedor só precisa do payload. */
export type NotificationTargetSource = Readonly<{ payload: Readonly<Record<string, unknown>> }>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O payload é dado externo: só id em formato de UUID vira rota. */
function readId(payload: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined
}

/** A ocorrência (direta ou como assunto da conversa) vence a viagem; sem id válido, o aviso não navega. */
export function resolveNotificationTarget(
  notification: NotificationTargetSource,
): NotificationTarget | null {
  const { payload } = notification
  const subjectOccurrenceId =
    payload['subjectType'] === 'occurrence' ? readId(payload, 'subjectId') : undefined
  const occurrenceId = readId(payload, 'occurrenceId') ?? subjectOccurrenceId
  if (occurrenceId !== undefined) {
    return { href: buildTripOccurrenceRoute(occurrenceId), workspace: 'trip-occurrences' }
  }
  const tripId = readId(payload, 'tripId')
  if (tripId !== undefined) return { href: buildTripRoute(tripId), workspace: 'trip' }
  return null
}
