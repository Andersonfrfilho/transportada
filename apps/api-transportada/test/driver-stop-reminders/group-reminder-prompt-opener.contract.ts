/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.3 (RF14): o abridor do grupo cria o pedido aberto no passo `reminder.stage` antes do envio, só quando
 * o grupo não tem outro pedido aberto, e o descarta se o envio falhar.
 */
import { describe, expect, test } from 'bun:test'

import { ReminderPromptBusyError } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.error.js'
import { createGroupReminderPromptOpener } from '../../src/driver-stop-reminders/infrastructure/group-reminder-prompt-opener.js'
import type {
  GroupRequest,
  GroupRequestRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'

const NOW = new Date('2026-11-07T17:00:00.000Z')
const PARAMS = {
  companyId: 'company-1',
  driverId: 'driver-1',
  groupJid: '120363000000000000@g.us',
  reminderId: 'reminder-1',
  stage: 'arrival',
  tripStopId: 'stop-1',
} as const

function build(options: { phone?: string | undefined; taken?: boolean; open?: GroupRequest } = {}) {
  const opened: unknown[] = []
  const updates: unknown[] = []
  const repository = {
    findOpen: async () => options.open ?? null,
    open: async (input: unknown) => {
      opened.push(input)
      return options.taken === true ? null : ({ id: 'request-1' } as GroupRequest)
    },
    update: async (input: unknown) => {
      updates.push(input)
      return true
    },
  } as unknown as GroupRequestRepositoryPort
  const opener = createGroupReminderPromptOpener({
    clock: () => NOW,
    readDriverNumber: async () => ('phone' in options ? options.phone : '5516999990001'),
    repository,
  })
  return { opened, opener, updates }
}

const request = (overrides: Partial<GroupRequest>): GroupRequest => ({
  attempts: 0,
  companyId: 'company-1',
  driverId: 'driver-1',
  expiresAt: NOW,
  groupJid: PARAMS.groupJid,
  id: 'request-1',
  ownerNumber: '5516999990001',
  state: { reminderId: 'reminder-1', stage: 'arrival', tripStopId: 'stop-1' },
  step: 'reminder.stage',
  version: 4n,
  ...overrides,
})

describe('o pedido do próprio lembrete (spec 299, correção pós-T2.3)', () => {
  test('hasOwnOpen: só o pedido aberto no passo e com o mesmo lembrete é dele', async () => {
    expect(await build({ open: request({}) }).opener.hasOwnOpen(PARAMS)).toBe(true)
    expect(await build({}).opener.hasOwnOpen(PARAMS)).toBe(false)
    expect(
      await build({
        open: request({ state: { reminderId: 'reminder-2', stage: 'arrival', tripStopId: 's' } }),
      }).opener.hasOwnOpen(PARAMS),
    ).toBe(false)
    expect(
      await build({ open: request({ step: 'occurrence.document' }) }).opener.hasOwnOpen(PARAMS),
    ).toBe(false)
  })

  test('open com pedido próprio aberto o substitui na mesma gravação', async () => {
    const world = build({ open: request({ version: 7n }) })
    await world.opener.open(PARAMS)
    expect(world.opened).toHaveLength(1)
    expect(world.opened[0]).toMatchObject({ replaces: { id: 'request-1', version: 7n } })
    expect(world.updates).toEqual([])
  })

  test('open com pedido de outro lembrete aberto não o substitui', async () => {
    const world = build({
      open: request({ state: { reminderId: 'reminder-2', stage: 'arrival', tripStopId: 's' } }),
      taken: true,
    })
    await expect(world.opener.open(PARAMS)).rejects.toBeInstanceOf(ReminderPromptBusyError)
    expect(world.opened[0]).not.toHaveProperty('replaces')
  })
})

describe('abridor do passo reminder.stage (spec 299 T2.3, RF14)', () => {
  test('abre o pedido do motorista no passo, com o estado do lembrete', async () => {
    const world = build()
    await world.opener.open(PARAMS)
    expect(world.opened).toEqual([
      {
        companyId: 'company-1',
        driverId: 'driver-1',
        groupJid: PARAMS.groupJid,
        now: NOW,
        ownerNumber: '5516999990001',
        state: { reminderId: 'reminder-1', stage: 'arrival', tripStopId: 'stop-1' },
        step: 'reminder.stage',
      },
    ])
  })

  test('outro pedido aberto no grupo: não abre, avisa a entrega para não enviar', async () => {
    const world = build({ taken: true })
    await expect(world.opener.open(PARAMS)).rejects.toBeInstanceOf(ReminderPromptBusyError)
  })

  test('motorista sem telefone válido abre o pedido sem dono', async () => {
    const world = build({ phone: undefined })
    await world.opener.open(PARAMS)
    expect(world.opened).toMatchObject([{ ownerNumber: '' }])
  })

  test('descartar fecha como cancelado o pedido que este lembrete abriu', async () => {
    const world = build({ open: request({}) })
    await world.opener.discard(PARAMS)
    expect(world.updates).toMatchObject([
      { close: 'cancelled', companyId: 'company-1', id: 'request-1', version: 4n },
    ])
  })

  test('descartar nunca fecha o pedido de outro lembrete nem de outro passo', async () => {
    for (const open of [
      request({ state: { reminderId: 'reminder-2' } }),
      request({ step: 'menu' }),
    ]) {
      const world = build({ open })
      await world.opener.discard(PARAMS)
      expect(world.updates).toEqual([])
    }
  })
})
