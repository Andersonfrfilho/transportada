/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T0.2 (D2, RF6): de onde parte a previsão do tempo de viagem e se ela pode ser mostrada.
 */
import { describe, expect, test } from 'bun:test'

import { resolveStopReminderOrigin } from '../../src/driver-stop-reminders/domain/stop-reminder-origin.policy.js'

const SHARED = { latitude: -21.1775, longitude: -47.8103 }
const PREVIOUS_STOP = { latitude: -21.2, longitude: -47.9 }
const COMPANY = { latitude: -21.3, longitude: -47.7 }

describe('origem da previsão (D2)', () => {
  test('ponto compartilhado nesta perna vence tudo e é o único que libera a previsão mostrada', () => {
    expect(
      resolveStopReminderOrigin({
        sharedPoint: SHARED,
        previousStopPoint: PREVIOUS_STOP,
        companyPoint: COMPANY,
      }),
    ).toEqual({ kind: 'shared_point', point: SHARED, isSharedPoint: true })
  })

  test('sem ponto compartilhado, parte da parada anterior', () => {
    expect(
      resolveStopReminderOrigin({
        sharedPoint: undefined,
        previousStopPoint: PREVIOUS_STOP,
        companyPoint: COMPANY,
      }),
    ).toEqual({ kind: 'previous_stop', point: PREVIOUS_STOP, isSharedPoint: false })
  })

  test('primeira parada sem ponto compartilhado parte do endereço da empresa', () => {
    expect(
      resolveStopReminderOrigin({
        sharedPoint: undefined,
        previousStopPoint: undefined,
        companyPoint: COMPANY,
      }),
    ).toEqual({ kind: 'company', point: COMPANY, isSharedPoint: false })
  })

  test('parada anterior sem coordenada cai para a empresa', () => {
    expect(resolveStopReminderOrigin({ sharedPoint: undefined, companyPoint: COMPANY })).toEqual({
      kind: 'company',
      point: COMPANY,
      isSharedPoint: false,
    })
  })

  test('nenhuma coordenada em lugar nenhum: reserva, sem ponto e sem previsão mostrada', () => {
    expect(resolveStopReminderOrigin({})).toEqual({
      kind: 'fallback',
      point: undefined,
      isSharedPoint: false,
    })
  })

  test('só o primeiro tipo marca isSharedPoint', () => {
    const kinds = [
      resolveStopReminderOrigin({ sharedPoint: SHARED }),
      resolveStopReminderOrigin({ previousStopPoint: PREVIOUS_STOP }),
      resolveStopReminderOrigin({ companyPoint: COMPANY }),
      resolveStopReminderOrigin({}),
    ].map((origin) => origin.isSharedPoint)
    expect(kinds).toEqual([true, false, false, false])
  })
})
