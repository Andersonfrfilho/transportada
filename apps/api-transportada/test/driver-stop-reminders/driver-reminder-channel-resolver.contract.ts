/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.5 (D5, T0.1): o canal do lembrete é o da última mensagem de entrada do motorista; o mais recente vence,
 * nenhum vale grupo. O uso do app não é fonte. Os dados de outra empresa nunca entram.
 */
import { describe, expect, test } from 'bun:test'

import { createDriverReminderChannelResolver } from '../../src/driver-stop-reminders/application/driver-reminder-channel-resolver.service.js'

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const GROUP = '120363000000000000@g.us'
const PHONE = '5516999990001'
const GROUP_AT = new Date('2026-11-07T15:00:00.000Z')
const DIRECT_AT = new Date('2026-11-07T16:00:00.000Z')

type Activity = { readonly direct?: Date; readonly group?: Date }

function build(activity: Record<string, Activity>, contact: { groupJid?: string; phone?: string }) {
  return createDriverReminderChannelResolver({
    readContact: async () => ({ groupJid: contact.groupJid, phone: contact.phone }),
    readLastDirectInboundAt: async ({ companyId, phone }) =>
      phone === PHONE ? activity[companyId]?.direct : undefined,
    readLastGroupActivityAt: async ({ companyId, groupJid }) =>
      groupJid === GROUP ? activity[companyId]?.group : undefined,
  })
}

const resolve = (resolver: ReturnType<typeof build>, companyId = COMPANY_ID) =>
  resolver.resolve({ companyId, driverId: 'driver-1' })

describe('resolvedor do canal do lembrete (spec 299 T2.5)', () => {
  test('o grupo mais recente vence', async () => {
    const resolver = build(
      { [COMPANY_ID]: { direct: GROUP_AT, group: DIRECT_AT } },
      { groupJid: GROUP, phone: PHONE },
    )
    expect(await resolve(resolver)).toBe('group')
  })

  test('o individual mais recente vence', async () => {
    const resolver = build(
      { [COMPANY_ID]: { direct: DIRECT_AT, group: GROUP_AT } },
      { groupJid: GROUP, phone: PHONE },
    )
    expect(await resolve(resolver)).toBe('direct')
  })

  test('empate: grupo', async () => {
    const resolver = build(
      { [COMPANY_ID]: { direct: GROUP_AT, group: GROUP_AT } },
      { groupJid: GROUP, phone: PHONE },
    )
    expect(await resolve(resolver)).toBe('group')
  })

  test('nenhuma mensagem de entrada: grupo (padrão)', async () => {
    expect(await resolve(build({}, { groupJid: GROUP, phone: PHONE }))).toBe('group')
  })

  test('só o individual existe: individual; sem telefone ou sem grupo a fonte ausente não conta', async () => {
    const activity = { [COMPANY_ID]: { direct: DIRECT_AT, group: GROUP_AT } }
    expect(await resolve(build(activity, { phone: PHONE }))).toBe('direct')
    expect(await resolve(build(activity, { groupJid: GROUP }))).toBe('group')
    expect(await resolve(build(activity, {}))).toBe('group')
  })

  test('dado de outra empresa é ignorado', async () => {
    const resolver = build(
      { [OTHER_COMPANY_ID]: { direct: DIRECT_AT, group: GROUP_AT } },
      { groupJid: GROUP, phone: PHONE },
    )
    expect(await resolve(resolver)).toBe('group')
    expect(await resolve(resolver, OTHER_COMPANY_ID)).toBe('direct')
  })
})
