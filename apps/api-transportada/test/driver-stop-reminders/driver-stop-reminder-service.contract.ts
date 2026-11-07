/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T1.4: o serviço aplica a política de transição pela porta; o refinador nunca grava sem estrada.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ApplyStopReminderRefinementParams,
  CloseStopReminderParams,
  DriverStopReminderRepository,
  OpenStopReminderParams,
  StopReminderRefinementInput,
  StopReminderStopContext,
} from '../../src/driver-stop-reminders/application/driver-stop-reminder.port.js'
import { createDriverStopReminderService } from '../../src/driver-stop-reminders/application/driver-stop-reminder.service.js'
import { createDriverStopReminderRefiner } from '../../src/driver-stop-reminders/application/refine-driver-stop-reminder-schedule.service.js'
import { DRIVER_STOP_REMINDER_DEFAULT_SETTINGS } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'

const COMPANY_ID = 'company-1'
const OCCURRED_AT = new Date('2026-11-06T10:00:00.000Z')
const CONTEXT: StopReminderStopContext = {
  driverId: 'driver-1',
  stopId: 'stop-1',
  tripId: 'trip-1',
}

function buildFakeRepository(contexts: readonly StopReminderStopContext[]) {
  const opened: OpenStopReminderParams[] = []
  const closed: CloseStopReminderParams[] = []
  const repository: DriverStopReminderRepository = {
    close: async (params) => {
      closed.push(params)
    },
    listPending: async () => [{ id: 'reminder-open', stage: 'arrival', stopId: 'stop-1' }],
    open: async (params) => {
      opened.push(params)
      return { id: `reminder-${opened.length}` }
    },
    readSettings: async () => DRIVER_STOP_REMINDER_DEFAULT_SETTINGS,
    readStopContexts: async () => contexts,
  }
  return { closed, opened, repository }
}

describe('DriverStopReminderService (spec 299 T1.4)', () => {
  test('a chegada do escritório fecha a chegada e abre a entrega com a hora do evento', async () => {
    const fake = buildFakeRepository([CONTEXT])

    const result = await createDriverStopReminderService({
      repository: fake.repository,
    }).onStopEvent({
      channel: 'office',
      companyId: COMPANY_ID,
      kind: 'arrived',
      occurredAt: OCCURRED_AT,
      target: { stopId: 'stop-1' },
    })

    expect(fake.closed).toEqual([
      {
        closedAt: OCCURRED_AT,
        companyId: COMPANY_ID,
        reason: 'arrived',
        reminderId: 'reminder-open',
      },
    ])
    expect(fake.opened).toHaveLength(1)
    expect(fake.opened[0]).toMatchObject({ anchorAt: OCCURRED_AT, stage: 'settlement' })
    expect(result.openedReminderIds).toEqual(['reminder-1'])
  })

  test('viagem sem condutor definido não abre lembrete', async () => {
    const fake = buildFakeRepository([{ ...CONTEXT, driverId: undefined }])

    const result = await createDriverStopReminderService({
      repository: fake.repository,
    }).onStopEvent({
      channel: 'driver_app',
      companyId: COMPANY_ID,
      kind: 'arrived',
      occurredAt: OCCURRED_AT,
      target: { stopId: 'stop-1' },
    })

    expect(fake.opened).toHaveLength(0)
    expect(result.openedReminderIds).toHaveLength(0)
  })

  test('a ocorrência por notas fecha o lembrete das paradas dessas notas', async () => {
    const fake = buildFakeRepository([CONTEXT])

    await createDriverStopReminderService({ repository: fake.repository }).onStopEvent({
      channel: 'office',
      companyId: COMPANY_ID,
      kind: 'occurrence',
      occurredAt: OCCURRED_AT,
      target: { documentIds: ['document-1'] },
    })

    expect(fake.closed[0]?.reason).toBe('occurrence')
    expect(fake.opened).toHaveLength(0)
  })
})

describe('refinador do lembrete (spec 299 T1.4)', () => {
  const INPUT: StopReminderRefinementInput = {
    anchorAt: OCCURRED_AT,
    companyId: COMPANY_ID,
    destination: { latitude: -23.56, longitude: -46.64 },
    previousStopPoint: undefined,
    reminderId: 'reminder-1',
    settings: DRIVER_STOP_REMINDER_DEFAULT_SETTINGS,
    sharedPoint: { latitude: -23.55, longitude: -46.63 },
    stage: 'arrival',
    tripStopId: 'stop-1',
    version: 1n,
  }

  function buildRefiner(overrides: {
    readonly input?: StopReminderRefinementInput | undefined
    readonly seconds?: number | null
  }) {
    const applied: ApplyStopReminderRefinementParams[] = []
    const refiner = createDriverStopReminderRefiner({
      readDepot: async () => ({ reason: 'not_configured', status: 'absent' }),
      repository: {
        applyRefinement: async (params) => {
          applied.push(params)
          return true
        },
        readRefinementInput: async () => ('input' in overrides ? overrides.input : INPUT),
      },
      routing: {
        readRouteGeometry: async () =>
          overrides.seconds === null
            ? null
            : {
                legs: [{ distanceMetres: 1, durationSeconds: overrides.seconds ?? 600 }],
                nodeIds: null,
                nodeIdsByLeg: null,
                points: [],
              },
      },
    })
    return { applied, refiner }
  }

  test('grava a estrada com a versão lida', async () => {
    const { applied, refiner } = buildRefiner({ seconds: 600 })

    await refiner.refine({ companyId: COMPANY_ID, reminderId: 'reminder-1' })

    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      originKind: 'shared_point',
      travelSeconds: 600,
      version: 1n,
    })
  })

  test('a entrega (settlement) nunca é refinada pela estrada', async () => {
    const { applied, refiner } = buildRefiner({
      input: { ...INPUT, stage: 'settlement' },
      seconds: 600,
    })

    await refiner.refine({ companyId: COMPANY_ID, reminderId: 'reminder-1' })

    expect(applied).toHaveLength(0)
  })

  test('OSRM sem resposta, destino sem geocódigo ou origem ausente não gravam', async () => {
    const down = buildRefiner({ seconds: null })
    const noDestination = buildRefiner({ input: { ...INPUT, destination: undefined } })
    const noOrigin = buildRefiner({ input: { ...INPUT, sharedPoint: undefined } })

    await down.refiner.refine({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    await noDestination.refiner.refine({ companyId: COMPANY_ID, reminderId: 'reminder-1' })
    await noOrigin.refiner.refine({ companyId: COMPANY_ID, reminderId: 'reminder-1' })

    expect(down.applied).toHaveLength(0)
    expect(noDestination.applied).toHaveLength(0)
    expect(noOrigin.applied).toHaveLength(0)
  })
})
