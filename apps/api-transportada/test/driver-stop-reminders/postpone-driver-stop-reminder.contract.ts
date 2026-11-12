/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.3 (RF13): a opção 4 adia pelo intervalo sem consumir tentativa, no máximo 3 por etapa; esgotado, a
 * resposta conta como sem resposta e nada é gravado. Lembrete que já não está pendente não adia.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverStopReminderPostponementRepository } from '../../src/driver-stop-reminders/application/driver-stop-reminder-postponement.port.js'
import { createPostponeDriverStopReminderUseCase } from '../../src/driver-stop-reminders/application/postpone-driver-stop-reminder.use-case.js'

const COMPANY_ID = 'company-1'
const NOW = new Date('2026-11-07T17:00:00.000Z')
const MINUTE = 60_000

function build(reminder: { status: string; postponements: number } | undefined) {
  const writes: unknown[] = []
  const repository: DriverStopReminderPostponementRepository = {
    applyPostponement: async (params) => {
      writes.push(params)
      return true
    },
    find: async ({ companyId }) => (companyId === COMPANY_ID ? reminder : undefined),
    readIntervalMinutes: async () => 20,
  }
  const useCase = createPostponeDriverStopReminderUseCase({ clock: () => NOW, repository })
  return { useCase, writes }
}

describe('adiar o lembrete pela opção 4 (spec 299 T2.3, RF13)', () => {
  test('adia pelo intervalo, devolve a tentativa e soma um adiamento', async () => {
    const world = build({ postponements: 1, status: 'pending' })
    const result = await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'r1' })
    expect(result).toEqual({ outcome: 'postponed' })
    expect(world.writes).toEqual([
      {
        companyId: COMPANY_ID,
        dueAt: new Date(NOW.getTime() + 20 * MINUTE),
        now: NOW,
        postponements: 1,
        reminderId: 'r1',
      },
    ])
  })

  test('o terceiro adiamento ainda adia', async () => {
    const world = build({ postponements: 2, status: 'pending' })
    expect(await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'r1' })).toEqual({
      outcome: 'postponed',
    })
  })

  test('com 3 adiamentos feitos a opção 4 conta como sem resposta e não grava nada', async () => {
    const world = build({ postponements: 3, status: 'pending' })
    expect(await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'r1' })).toEqual({
      outcome: 'no_answer',
    })
    expect(world.writes).toEqual([])
  })

  test.each(['closed', 'escalated', 'cancelled'])('lembrete %s não adia', async (status) => {
    const world = build({ postponements: 0, status })
    expect(await world.useCase.execute({ companyId: COMPANY_ID, reminderId: 'r1' })).toEqual({
      outcome: 'closed',
    })
    expect(world.writes).toEqual([])
  })

  test('lembrete de outra empresa (ou inexistente) não adia', async () => {
    const world = build({ postponements: 0, status: 'pending' })
    expect(await world.useCase.execute({ companyId: 'company-2', reminderId: 'r1' })).toEqual({
      outcome: 'closed',
    })
    expect(world.writes).toEqual([])
  })

  test('corrida perdida na gravação (o lembrete mudou no meio) devolve closed', async () => {
    const repository: DriverStopReminderPostponementRepository = {
      applyPostponement: async () => false,
      find: async () => ({ postponements: 0, status: 'pending' }),
      readIntervalMinutes: async () => 20,
    }
    const useCase = createPostponeDriverStopReminderUseCase({ clock: () => NOW, repository })
    expect(await useCase.execute({ companyId: COMPANY_ID, reminderId: 'r1' })).toEqual({
      outcome: 'closed',
    })
  })
})
