/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 CA14 / RF24 a RF28: lembretes de vencimento. Vermelho até a T7.4.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { createRunExpenseRemindersUseCase } from '../../src/expenses/application/expense-reminder.use-case.js'
import {
  ADMIN_ID,
  buildInMemoryReminders,
  buildOccurrence,
  COMPANY_A,
  COMPANY_B,
  type InMemoryReminders,
  RESPONSIBLE_ID,
  TODAY,
} from '../fixtures/expense-reminders-in-memory.fixture.js'

let mem: InMemoryReminders
const run = (today = TODAY, companyId = COMPANY_A) =>
  createRunExpenseRemindersUseCase(mem.ports).execute({ companyId, today })

beforeEach(() => {
  mem = buildInMemoryReminders()
})

describe('lembretes de vencimento (spec 325 CA14)', () => {
  it('avisa o responsável 3 dias antes, uma vez, por e-mail', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', dueDate: '2026-11-13' })]
    const result = await run()
    expect(result.sent).toBe(1)
    expect(mem.notifications).toHaveLength(1)
    expect(mem.notifications[0]).toMatchObject({
      channel: 'email',
      kind: 'before',
      occurrenceId: 'o1',
      recipientUserId: RESPONSIBLE_ID,
    })
  })

  it('não avisa antes da janela (4 dias) e usa o prazo configurado da empresa', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', dueDate: '2026-11-14' })]
    await run()
    expect(mem.notifications).toHaveLength(0)
    mem.settings = { ...mem.settings, daysBefore: 4 }
    await run()
    expect(mem.notifications).toHaveLength(1)
  })

  it('avisa no dia do vencimento (due_today)', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', dueDate: TODAY })]
    await run()
    expect(mem.notifications[0]?.kind).toBe('due_today')
  })

  it('avisa a cada dia de atraso até 3 avisos e depois para', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', dueDate: '2026-11-06' })]
    for (const day of ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])
      await run(day)
    expect(mem.notifications.filter((n) => n.kind === 'overdue')).toHaveLength(3)
  })

  it('rodar duas vezes no mesmo dia não duplica o aviso', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1' }), buildOccurrence({ id: 'o2', dueDate: TODAY })]
    const first = await run()
    const second = await run()
    expect(first.sent).toBe(2)
    expect(second.sent).toBe(0)
    expect(second.skipped).toBe(2)
    expect(mem.notifications).toHaveLength(2)
  })

  it('conta paga ou cancelada não avisa', async () => {
    mem.occurrences = [
      buildOccurrence({ id: 'o1', status: 'paid' }),
      buildOccurrence({ id: 'o2', status: 'canceled' }),
    ]
    const result = await run()
    expect(result.sent).toBe(0)
    expect(mem.notifications).toHaveLength(0)
  })

  it('sem responsável, o aviso vai ao administrador', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', responsibleUserId: null })]
    await run()
    expect(mem.notifications.map((n) => n.recipientUserId)).toEqual([ADMIN_ID])
  })

  it('responsável que não existe mais cai no administrador', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', responsibleUserId: 'gone' })]
    await run()
    expect(mem.notifications.map((n) => n.recipientUserId)).toEqual([ADMIN_ID])
  })

  it('canal desligado na empresa não sai, mesmo que a pessoa o tenha ligado; e-mail segue', async () => {
    mem.recipients.set(RESPONSIBLE_ID, { channels: ['email', 'whatsapp'], userId: RESPONSIBLE_ID })
    mem.occurrences = [buildOccurrence({ id: 'o1' })]
    await run()
    expect(mem.notifications.map((n) => n.channel)).toEqual(['email'])
  })

  it('canal ligado na empresa e na pessoa sai além do e-mail', async () => {
    mem.recipients.set(RESPONSIBLE_ID, { channels: ['email', 'whatsapp'], userId: RESPONSIBLE_ID })
    mem.settings = { ...mem.settings, enabledChannels: ['email', 'whatsapp'] }
    mem.occurrences = [buildOccurrence({ id: 'o1' })]
    await run()
    expect(mem.notifications.map((n) => n.channel).sort()).toEqual(['email', 'whatsapp'])
  })

  it('falha de envio não derruba a rotina: as outras saem e a falha é contada', async () => {
    mem.failFor.add('o1')
    mem.occurrences = [buildOccurrence({ id: 'o1' }), buildOccurrence({ id: 'o2' })]
    const result = await run()
    expect(result.failed).toBe(1)
    expect(result.sent).toBe(1)
    expect(mem.notifications.map((n) => n.occurrenceId)).toEqual(['o2'])
  })

  it('isolamento: só olha as ocorrências da empresa da rotina', async () => {
    mem.occurrences = [buildOccurrence({ id: 'o1', companyId: COMPANY_B })]
    const result = await run()
    expect(result.sent).toBe(0)
  })
})
