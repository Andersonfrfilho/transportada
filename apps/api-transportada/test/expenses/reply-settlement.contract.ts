/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 CA15 / RF29 a RF31: baixa por resposta ("paguei") e desfazer em 24 h. Vermelho até a T7.4b.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  createSettleExpenseByReplyUseCase,
  createUndoReplySettlementUseCase,
} from '../../src/expenses/application/expense-reminder.use-case.js'
import {
  ExpenseReplyUndoExpiredError,
  ExpenseReplyUndoForbiddenError,
  ExpenseReplyUndoNotReplyError,
  ExpenseReplyUndoReasonRequiredError,
} from '../../src/expenses/domain/expense.error.js'
import {
  ADMIN_ID,
  buildInMemoryReplySettlement,
  buildOccurrence,
  COMPANY_A,
  COMPANY_B,
  OTHER_PHONE,
  RESPONSIBLE_ID,
  RESPONSIBLE_PHONE,
  type ReplyState,
  TODAY,
} from '../fixtures/expense-reminders-in-memory.fixture.js'

let mem: ReplyState
const settle = (
  input: Parameters<ReturnType<typeof createSettleExpenseByReplyUseCase>['execute']>[0],
) => createSettleExpenseByReplyUseCase(mem.ports).execute(input)
const whatsapp = (phone: string, text = 'paguei') => ({ channel: 'whatsapp' as const, phone, text })

beforeEach(() => {
  mem = buildInMemoryReplySettlement([buildOccurrence({ id: 'o1' })])
})

describe('"paguei" pelo WhatsApp (spec 325 CA15)', () => {
  it('o responsável baixa com o valor previsto e a data do dia, gravando autor e canal', async () => {
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: TODAY,
    })
    expect(result.status).toBe('settled')
    expect(mem.occurrences[0]).toMatchObject({
      paidAmount: '1500.00',
      paidAt: TODAY,
      paidBy: RESPONSIBLE_ID,
      status: 'paid',
    })
    expect(mem.replySettled.get('o1')?.channel).toBe('whatsapp')
  })

  it('aceita a palavra com caixa e espaços diferentes', async () => {
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE, '  Paguei! '),
      today: TODAY,
    })
    expect(result.status).toBe('settled')
  })

  it('outra palavra não baixa', async () => {
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE, 'talvez'),
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'unknown_word', status: 'refused' })
    expect(mem.occurrences[0]?.status).toBe('open')
  })

  it('quem não é o responsável não baixa', async () => {
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(OTHER_PHONE),
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'not_responsible', status: 'refused' })
    expect(mem.occurrences[0]?.status).toBe('open')
  })

  it('número desconhecido não baixa', async () => {
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp('5500000000000'),
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'not_responsible', status: 'refused' })
  })

  it('resposta repetida não baixa de novo', async () => {
    await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: TODAY,
    })
    const again = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: '2026-11-11',
    })
    expect(again).toEqual({ reason: 'not_open', status: 'refused' })
    expect(mem.occurrences[0]?.paidAt).toBe(TODAY)
  })

  it('ocorrência cancelada não baixa', async () => {
    mem.occurrences[0] = buildOccurrence({ id: 'o1', status: 'canceled' })
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'not_open', status: 'refused' })
  })

  it('sem responsável na conta, ninguém baixa por resposta', async () => {
    mem.occurrences[0] = buildOccurrence({ id: 'o1', responsibleUserId: null })
    const result = await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'not_responsible', status: 'refused' })
  })

  it('isolamento: ocorrência de outra empresa não baixa', async () => {
    const result = await settle({
      companyId: COMPANY_B,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: TODAY,
    })
    expect(result.status).toBe('refused')
    expect(mem.occurrences[0]?.status).toBe('open')
  })
})

describe('"Já paguei" pelo e-mail (spec 325 CA15)', () => {
  const link = {
    companyId: COMPANY_A,
    occurrenceId: 'o1',
    recipientUserId: RESPONSIBLE_ID,
    status: 'valid' as const,
  }

  it('o link baixa uma vez com o valor previsto e a data do dia', async () => {
    mem.links.set('tok', link)
    const result = await settle({
      companyId: COMPANY_A,
      sender: { channel: 'email', token: 'tok' },
      today: TODAY,
    })
    expect(result.status).toBe('settled')
    expect(mem.replySettled.get('o1')?.channel).toBe('email')
  })

  it('o link só vale uma vez', async () => {
    mem.links.set('tok', link)
    await settle({ companyId: COMPANY_A, sender: { channel: 'email', token: 'tok' }, today: TODAY })
    const again = await settle({
      companyId: COMPANY_A,
      sender: { channel: 'email', token: 'tok' },
      today: TODAY,
    })
    expect(again).toEqual({ reason: 'already_used', status: 'refused' })
  })

  it('link vencido ou desconhecido não baixa', async () => {
    mem.links.set('old', { status: 'expired' })
    expect(
      await settle({
        companyId: COMPANY_A,
        sender: { channel: 'email', token: 'old' },
        today: TODAY,
      }),
    ).toEqual({ reason: 'expired', status: 'refused' })
    const unknown = await settle({
      companyId: COMPANY_A,
      sender: { channel: 'email', token: 'nope' },
      today: TODAY,
    })
    expect(unknown.status).toBe('refused')
    expect(mem.occurrences[0]?.status).toBe('open')
  })

  it('link de quem deixou de ser o responsável não baixa', async () => {
    mem.links.set('tok', { ...link, recipientUserId: 'ex-responsible' })
    const result = await settle({
      companyId: COMPANY_A,
      sender: { channel: 'email', token: 'tok' },
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'not_responsible', status: 'refused' })
  })

  it('link de ocorrência já paga não baixa e não gasta o link', async () => {
    mem.occurrences[0] = buildOccurrence({ id: 'o1', status: 'paid' })
    mem.links.set('tok', link)
    const result = await settle({
      companyId: COMPANY_A,
      sender: { channel: 'email', token: 'tok' },
      today: TODAY,
    })
    expect(result).toEqual({ reason: 'not_open', status: 'refused' })
  })
})

describe('desfazer a baixa por resposta (spec 325 RF31)', () => {
  const undo = (
    over: Partial<
      Parameters<ReturnType<typeof createUndoReplySettlementUseCase>['execute']>[0]
    > = {},
  ) =>
    createUndoReplySettlementUseCase(mem.ports).execute({
      actorIsAdmin: true,
      actorUserId: ADMIN_ID,
      companyId: COMPANY_A,
      nowIso: `${TODAY}T18:00:00.000Z`,
      occurrenceId: 'o1',
      reason: 'valor errado',
      ...over,
    })

  beforeEach(async () => {
    await settle({
      companyId: COMPANY_A,
      occurrenceId: 'o1',
      sender: whatsapp(RESPONSIBLE_PHONE),
      today: TODAY,
    })
  })

  it('o administrador desfaz em até 24 h, com motivo, e fica na trilha', async () => {
    await undo()
    expect(mem.occurrences[0]?.status).toBe('open')
    expect(mem.audit).toHaveLength(1)
    expect(mem.audit[0]?.metadata).toMatchObject({ reason: 'valor errado' })
  })

  it('depois de 24 h não desfaz', async () => {
    await expect(undo({ nowIso: '2026-11-11T12:00:01.000Z' })).rejects.toBeInstanceOf(
      ExpenseReplyUndoExpiredError,
    )
    expect(mem.occurrences[0]?.status).toBe('paid')
  })

  it('quem não é administrador não desfaz', async () => {
    await expect(undo({ actorIsAdmin: false })).rejects.toBeInstanceOf(
      ExpenseReplyUndoForbiddenError,
    )
    expect(mem.occurrences[0]?.status).toBe('paid')
  })

  it('sem motivo não desfaz', async () => {
    await expect(undo({ reason: '  ' })).rejects.toBeInstanceOf(ExpenseReplyUndoReasonRequiredError)
    expect(mem.occurrences[0]?.status).toBe('paid')
  })

  it('baixa dada no painel (não por resposta) não é desfeita por aqui', async () => {
    mem.replySettled.delete('o1')
    await expect(undo()).rejects.toBeInstanceOf(ExpenseReplyUndoNotReplyError)
    expect(mem.occurrences[0]?.status).toBe('paid')
  })
})
