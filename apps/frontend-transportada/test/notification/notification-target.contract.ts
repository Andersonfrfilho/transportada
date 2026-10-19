/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveNotificationTarget } from '../../src/modules/notification/shared/notificationTarget.service'

const TRIP = '00000000-0000-4000-8000-000000000011'
const OCCURRENCE = '00000000-0000-4000-8000-0000000000c1'

function notificationWith(payload: Record<string, unknown>): { payload: Record<string, unknown> } {
  return { payload }
}

describe('o destino do clique no aviso (spec 275 RF-L)', () => {
  test('payload com a ocorrência abre o detalhe da ocorrência', () => {
    expect(
      resolveNotificationTarget(notificationWith({ occurrenceId: OCCURRENCE, tripId: TRIP })),
    ).toEqual({ href: `/ocorrencias/${OCCURRENCE}`, workspace: 'trip-occurrences' })
  })

  test('aviso de conversa e de resolução leva a ocorrência em subjectId', () => {
    expect(
      resolveNotificationTarget(
        notificationWith({ subjectId: OCCURRENCE, subjectType: 'occurrence' }),
      ),
    ).toEqual({ href: `/ocorrencias/${OCCURRENCE}`, workspace: 'trip-occurrences' })
  })

  test('só a viagem abre o detalhe da viagem', () => {
    expect(resolveNotificationTarget(notificationWith({ tripId: TRIP }))).toEqual({
      href: `/trips/${TRIP}`,
      workspace: 'trip',
    })
  })

  test('sem id, ou com id que não é UUID, não navega', () => {
    expect(resolveNotificationTarget(notificationWith({}))).toBeNull()
    expect(resolveNotificationTarget(notificationWith({ documentLabel: '883658/1' }))).toBeNull()
    expect(
      resolveNotificationTarget(notificationWith({ occurrenceId: '../../admin', tripId: TRIP })),
    ).toEqual({ href: `/trips/${TRIP}`, workspace: 'trip' })
    expect(resolveNotificationTarget(notificationWith({ tripId: 'x/y?z' }))).toBeNull()
    expect(resolveNotificationTarget(notificationWith({ occurrenceId: 42 }))).toBeNull()
  })
})
