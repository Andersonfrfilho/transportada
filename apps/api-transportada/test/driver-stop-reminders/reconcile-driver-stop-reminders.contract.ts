/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 (dono, 2026-11-07): o lembrete segue a viagem ativa. A varredura abre a etapa atual que ainda não tem
 * lembrete, com o prazo da regra, e não faz nada com a chave global desligada.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CurrentStopReminderStage,
  DriverStopReminderReconciliationRepository,
} from '../../src/driver-stop-reminders/application/driver-stop-reminder-reconciliation.port.js'
import type { DriverStopReminderRepository } from '../../src/driver-stop-reminders/application/driver-stop-reminder.port.js'
import { createReconcileDriverStopRemindersUseCase } from '../../src/driver-stop-reminders/application/reconcile-driver-stop-reminders.use-case.js'
import { DRIVER_STOP_REMINDER_DEFAULT_SETTINGS } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const MINUTE = 60_000
const DEPARTURE = new Date('2026-11-06T22:01:00.000Z')
const ARRIVAL = new Date('2026-11-07T10:00:00.000Z')

const ARRIVAL_STAGE: CurrentStopReminderStage = {
  anchorAt: DEPARTURE,
  driverId: 'driver-1',
  stage: 'arrival',
  stopId: 'stop-1',
  tripId: 'trip-1',
}
const SETTLEMENT_STAGE: CurrentStopReminderStage = {
  anchorAt: ARRIVAL,
  driverId: 'driver-1',
  stage: 'settlement',
  stopId: 'stop-2',
  tripId: 'trip-1',
}

function build(input: {
  readonly isEnabled?: boolean
  readonly stages: readonly CurrentStopReminderStage[]
  readonly alreadyPending?: readonly string[]
}) {
  const reads: string[] = []
  const opens: (Parameters<DriverStopReminderReconciliationRepository['openIfStillCurrent']>[0] & {
    context: { stopId: string }
    anchorAt: Date
  })[] = []
  const limits: number[] = []
  const afterOpen: unknown[] = []
  const reconciliation: DriverStopReminderReconciliationRepository = {
    listMissingCurrentStages: async ({ companyId, limit }) => {
      reads.push(companyId)
      limits.push(limit)
      return input.stages
    },
    openIfStillCurrent: async (params) => {
      const stage = input.stages.find((item) => item.stopId === params.stopId)
      opens.push({
        ...params,
        anchorAt: stage?.anchorAt ?? new Date(0),
        context: { stopId: params.stopId },
      })
      if (input.alreadyPending?.includes(params.stopId) === true) return undefined
      return { id: `reminder-${params.stopId}` }
    },
  }
  const reminders: Pick<DriverStopReminderRepository, 'readSettings'> = {
    readSettings: async () => DRIVER_STOP_REMINDER_DEFAULT_SETTINGS,
  }
  const useCase = createReconcileDriverStopRemindersUseCase({
    afterOpen: (opened) => void afterOpen.push(...opened),
    isEnabled: input.isEnabled ?? true,
    reconciliation,
    reminders,
  })
  return { afterOpen, limits, opens, reads, useCase }
}

describe('a varredura garante o lembrete da etapa atual (spec 299, dono 2026-11-07)', () => {
  test('abre cada etapa que falta com a âncora do evento e o prazo da regra', async () => {
    const world = build({ stages: [ARRIVAL_STAGE, SETTLEMENT_STAGE] })
    const result = await world.useCase.execute({ companyId: COMPANY_ID })

    expect(result).toEqual({ openedCount: 2 })
    expect(world.opens.map((open) => [open.context.stopId, open.stage, open.anchorAt])).toEqual([
      ['stop-1', 'arrival', DEPARTURE],
      ['stop-2', 'settlement', ARRIVAL],
    ])
    expect(world.opens[1]?.dueAt).toEqual(
      new Date(ARRIVAL.getTime() + DRIVER_STOP_REMINDER_DEFAULT_SETTINGS.dwellMinutes * MINUTE),
    )
    expect(world.afterOpen).toEqual([
      { companyId: COMPANY_ID, reminderId: 'reminder-stop-1' },
      { companyId: COMPANY_ID, reminderId: 'reminder-stop-2' },
    ])
  })

  test('etapa que já tinha lembrete pendente (o único parcial) não conta nem é refinada', async () => {
    const world = build({ alreadyPending: ['stop-1'], stages: [ARRIVAL_STAGE, SETTLEMENT_STAGE] })
    expect(await world.useCase.execute({ companyId: COMPANY_ID })).toEqual({ openedCount: 1 })
    expect(world.afterOpen).toEqual([{ companyId: COMPANY_ID, reminderId: 'reminder-stop-2' }])
  })

  test('lê no máximo o teto por ciclo (L1)', async () => {
    const world = build({ stages: [ARRIVAL_STAGE] })
    await world.useCase.execute({ companyId: COMPANY_ID })
    expect(world.limits).toEqual([200])
  })

  test('sem nada faltando não abre nada', async () => {
    const world = build({ stages: [] })
    expect(await world.useCase.execute({ companyId: COMPANY_ID })).toEqual({ openedCount: 0 })
    expect(world.afterOpen).toEqual([])
  })

  test('chave global desligada: não lê nem abre nada', async () => {
    const world = build({ isEnabled: false, stages: [ARRIVAL_STAGE] })
    expect(await world.useCase.execute({ companyId: COMPANY_ID })).toEqual({ openedCount: 0 })
    expect(world.reads).toEqual([])
    expect(world.opens).toEqual([])
  })
})
