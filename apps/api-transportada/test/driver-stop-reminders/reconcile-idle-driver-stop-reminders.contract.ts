/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.7 (RF21): a varredura da etapa `idle` é própria: abre o lembrete da parada suposta, ancorado no
 * despacho ou na última baixa, vencendo em `âncora + idleMinutes`, e nada faz com a chave global desligada.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverStopReminderRepository } from '../../src/driver-stop-reminders/application/driver-stop-reminder.port.js'
import type {
  IdleStopReminderCandidate,
  DriverStopReminderIdleReconciliationRepository,
} from '../../src/driver-stop-reminders/application/driver-stop-reminder-idle-reconciliation.port.js'
import { createReconcileIdleDriverStopRemindersUseCase } from '../../src/driver-stop-reminders/application/reconcile-idle-driver-stop-reminders.use-case.js'
import { DRIVER_STOP_REMINDER_DEFAULT_SETTINGS } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const MINUTE = 60_000
const DISPATCH = new Date('2026-11-07T12:00:00.000Z')
const CANDIDATE: IdleStopReminderCandidate = {
  anchorAt: DISPATCH,
  driverId: 'driver-1',
  stopId: 'stop-1',
  tripId: 'trip-1',
}

function build(input: { isEnabled?: boolean; candidates: readonly IdleStopReminderCandidate[] }) {
  const reads: string[] = []
  const opens: Parameters<DriverStopReminderRepository['open']>[0][] = []
  const reconciliation: DriverStopReminderIdleReconciliationRepository = {
    listMissingIdleStages: async ({ companyId }) => {
      reads.push(companyId)
      return input.candidates
    },
  }
  const reminders: Pick<DriverStopReminderRepository, 'open' | 'readSettings'> = {
    open: async (params) => {
      opens.push(params)
      return { id: `reminder-${params.context.stopId}` }
    },
    readSettings: async () => ({ ...DRIVER_STOP_REMINDER_DEFAULT_SETTINGS, idleMinutes: 45 }),
  }
  const useCase = createReconcileIdleDriverStopRemindersUseCase({
    isEnabled: input.isEnabled ?? true,
    reconciliation,
    reminders,
  })
  return { opens, reads, useCase }
}

describe('a varredura da etapa idle (spec 299 T2.7)', () => {
  test('abre o idle da parada suposta com a âncora e o prazo idleMinutes da empresa', async () => {
    const world = build({ candidates: [CANDIDATE] })
    expect(await world.useCase.execute({ companyId: COMPANY_ID })).toEqual({ openedCount: 1 })
    expect(world.opens).toHaveLength(1)
    expect(world.opens[0]).toMatchObject({
      anchorAt: DISPATCH,
      companyId: COMPANY_ID,
      context: { driverId: 'driver-1', stopId: 'stop-1', tripId: 'trip-1' },
      dueAt: new Date(DISPATCH.getTime() + 45 * MINUTE),
      stage: 'idle',
    })
  })

  test('sem candidato não abre nada', async () => {
    const world = build({ candidates: [] })
    expect(await world.useCase.execute({ companyId: COMPANY_ID })).toEqual({ openedCount: 0 })
  })

  test('chave global desligada: não lê nem abre', async () => {
    const world = build({ candidates: [CANDIDATE], isEnabled: false })
    expect(await world.useCase.execute({ companyId: COMPANY_ID })).toEqual({ openedCount: 0 })
    expect(world.reads).toEqual([])
    expect(world.opens).toEqual([])
  })
})
