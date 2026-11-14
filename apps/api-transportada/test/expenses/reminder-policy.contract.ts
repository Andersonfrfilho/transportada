/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF24 a RF27): a regra de quando, quem e por qual canal. Tabela de casos sobre a política pura.
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderRecipient,
} from '../../src/expenses/application/expense-reminder.port.js'
import {
  belongsToDailySummary,
  chooseReminderRecipients,
  civilDaysBetween,
  effectiveReminderChannels,
  isReminderHour,
  personalReminderChannels,
  reminderKindOn,
} from '../../src/expenses/domain/expense-reminder.policy.js'

const TODAY = '2026-11-10'
const kindFor = (dueDate: string, settings = DEFAULT_REMINDER_SETTINGS, today = TODAY) =>
  reminderKindOn({ dueDate, settings, today })

describe('quando avisar (spec 325 RF25, T7.3)', () => {
  test.each([
    ['2026-11-14', null, '4 dias antes: fora da janela'],
    ['2026-11-13', 'before', 'exatamente 3 dias antes'],
    ['2026-11-12', null, '2 dias antes: o "antes" é um só'],
    ['2026-11-11', null, 'véspera: sem aviso próprio'],
    ['2026-11-10', 'due_today', 'no dia'],
    ['2026-11-09', 'overdue', '1º dia de atraso'],
    ['2026-11-08', 'overdue', '2º dia de atraso'],
    ['2026-11-07', 'overdue', '3º dia de atraso'],
    ['2026-11-06', null, '4º dia de atraso: parou'],
  ] as const)('%s → %s (%s)', (dueDate, expected) => {
    expect(kindFor(dueDate)).toBe(expected)
  })

  test('o prazo configurável vale (5 dias antes, 1 aviso de atraso)', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, daysBefore: 5, maxOverdueNotices: 1 }
    expect(kindFor('2026-11-15', settings)).toBe('before')
    expect(kindFor('2026-11-13', settings)).toBeNull()
    expect(kindFor('2026-11-09', settings)).toBe('overdue')
    expect(kindFor('2026-11-08', settings)).toBeNull()
  })

  test('0 dias antes desliga o "antes" (o dia continua) e 0 de atraso desliga o atraso', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, daysBefore: 0, maxOverdueNotices: 0 }
    expect(kindFor('2026-11-10', settings)).toBe('due_today')
    expect(kindFor('2026-11-09', settings)).toBeNull()
  })

  test('o atraso é contado pelo calendário: virada de mês e de ano, e fevereiro', () => {
    expect(kindFor('2026-10-31', DEFAULT_REMINDER_SETTINGS, '2026-11-01')).toBe('overdue')
    expect(kindFor('2027-01-01', DEFAULT_REMINDER_SETTINGS, '2026-12-29')).toBe('before')
    expect(civilDaysBetween('2028-02-27', '2028-03-01')).toBe(3)
    expect(civilDaysBetween('2027-02-27', '2027-03-01')).toBe(2)
  })

  test('data fora do formato é erro, não um aviso no dia errado', () => {
    expect(() => kindFor('10/11/2026')).toThrow()
  })

  test('nada sai antes da hora configurada (padrão 8h)', () => {
    expect(isReminderHour({ hourInSaoPaulo: 7, settings: DEFAULT_REMINDER_SETTINGS })).toBe(false)
    expect(isReminderHour({ hourInSaoPaulo: 8, settings: DEFAULT_REMINDER_SETTINGS })).toBe(true)
    expect(isReminderHour({ hourInSaoPaulo: 23, settings: { dailySummaryHour: 6 } })).toBe(true)
  })

  test('o resumo leva o que vence hoje e todo vencido aberto, nunca o que ainda vai vencer', () => {
    const inSummary = (dueDate: string, status = 'open') =>
      belongsToDailySummary({ dueDate, status, today: TODAY })
    expect(inSummary('2026-11-10')).toBe(true)
    expect(inSummary('2026-09-01')).toBe(true)
    expect(inSummary('2026-11-11')).toBe(false)
    expect(inSummary('2026-11-09', 'paid')).toBe(false)
    expect(inSummary('2026-11-09', 'canceled')).toBe(false)
  })
})

describe('por qual canal (spec 325 RF26, T7.3)', () => {
  const facts = {
    hasEmail: true,
    hasVerifiedWhatsapp: true,
    pushOptIn: false,
    whatsappOptIn: false,
  }

  test('e-mail sempre que há e-mail; WhatsApp e push só com opt-in', () => {
    expect(personalReminderChannels(facts)).toEqual(['email'])
    expect(personalReminderChannels({ ...facts, pushOptIn: true, whatsappOptIn: true })).toEqual([
      'email',
      'whatsapp',
      'push',
    ])
  })

  test('WhatsApp sem número verificado não sai, mesmo com opt-in', () => {
    expect(
      personalReminderChannels({ ...facts, hasVerifiedWhatsapp: false, whatsappOptIn: true }),
    ).toEqual(['email'])
  })

  test('sem e-mail cadastrado, só o que a pessoa ligou', () => {
    expect(personalReminderChannels({ ...facts, hasEmail: false })).toEqual([])
    expect(personalReminderChannels({ ...facts, hasEmail: false, pushOptIn: true })).toEqual([
      'push',
    ])
  })

  test('o canal precisa estar ligado na empresa também', () => {
    const recipient = { channels: ['email', 'whatsapp', 'push'] as const }
    expect(effectiveReminderChannels({ companyChannels: ['email'], recipient })).toEqual(['email'])
    expect(
      effectiveReminderChannels({ companyChannels: ['push', 'whatsapp', 'email'], recipient }),
    ).toEqual(['email', 'whatsapp', 'push'])
    expect(effectiveReminderChannels({ companyChannels: [], recipient })).toEqual([])
  })
})

describe('quem recebe (spec 325 RF24, T7.3)', () => {
  const responsible: ReminderRecipient = { channels: ['email', 'whatsapp'], userId: 'resp' }
  const admins: ReminderRecipient[] = [
    { channels: ['email'], userId: 'admin-1' },
    { channels: ['email'], userId: 'admin-2' },
  ]

  test('o responsável recebe, só nos canais ligados na empresa', () => {
    expect(chooseReminderRecipients({ admins, companyChannels: ['email'], responsible })).toEqual({
      reason: 'responsible',
      recipients: [{ channels: ['email'], userId: 'resp' }],
    })
  })

  test('sem responsável (ou fora da empresa), todos os administradores', () => {
    expect(
      chooseReminderRecipients({ admins, companyChannels: ['email'], responsible: null }),
    ).toEqual({ reason: 'no_responsible', recipients: admins })
  })

  test('responsável sem nenhum canal ligado na empresa cai nos administradores, em vez de sumir', () => {
    const onlyWhatsapp: ReminderRecipient = { channels: ['whatsapp'], userId: 'resp' }
    expect(
      chooseReminderRecipients({ admins, companyChannels: ['email'], responsible: onlyWhatsapp }),
    ).toEqual({ reason: 'responsible_unreachable', recipients: admins })
  })

  test('administrador sem canal fica de fora e não se repete; ninguém alcançável = lista vazia', () => {
    const choice = chooseReminderRecipients({
      admins: [...admins, { channels: [], userId: 'admin-3' }, admins[0] as ReminderRecipient],
      companyChannels: ['email'],
      responsible: null,
    })
    expect(choice.recipients.map((recipient) => recipient.userId)).toEqual(['admin-1', 'admin-2'])
    expect(
      chooseReminderRecipients({ admins, companyChannels: [], responsible }).recipients,
    ).toEqual([])
  })
})
