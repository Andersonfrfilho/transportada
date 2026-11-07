/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.1 (D8): o lembrete no grupo marca o motorista ATUAL da viagem (resolvido na hora do envio, não o
 * `driver_id` gravado na abertura) com o mesmo `@número` do suporte de menção do grupo.
 */
import { describe, expect, test } from 'bun:test'

import { createGroupStopReminderSender } from '../../src/driver-stop-reminders/infrastructure/group-stop-reminder-sender.gateway.js'
import { withGroupMention } from '../../src/whatsapp/application/whatsapp-group-mention.service.js'

const GROUP = '120363000000000000@g.us'
const CURRENT_DRIVER = '5516999990001'
const FORMER_DRIVER = '5516999990002'

function build(currentNumber: string | undefined) {
  const sent: Array<{
    body: string
    companyId: string
    mentionNumber?: string | undefined
    number: string
  }> = []
  const lookups: Array<{ companyId: string; tripId: string }> = []
  const sender = createGroupStopReminderSender({
    readCurrentDriverNumber: async (input) => {
      lookups.push(input)
      return currentNumber
    },
    sendText: async (input) => {
      sent.push(input)
      return { providerMessageId: 'provider-1' }
    },
  })
  return { lookups, sender, sent }
}

describe('withGroupMention (spec 299 T2.1)', () => {
  test('número válido abre o corpo com @número e o devolve para `mentioned`', () => {
    expect(withGroupMention({ body: 'Já chegou?', mentionNumber: CURRENT_DRIVER })).toEqual({
      body: `@${CURRENT_DRIVER} Já chegou?`,
      mentionNumber: CURRENT_DRIVER,
    })
  })

  test('sem número ou com número inválido sai sem marca, sem falhar', () => {
    expect(withGroupMention({ body: 'oi', mentionNumber: undefined })).toEqual({ body: 'oi' })
    expect(withGroupMention({ body: 'oi', mentionNumber: '123' })).toEqual({ body: 'oi' })
    expect(withGroupMention({ body: 'oi' })).toEqual({ body: 'oi' })
  })
})

describe('envio do lembrete no grupo (spec 299 T2.1)', () => {
  test('pede a menção do motorista atual e o corpo traz o @número', async () => {
    const { lookups, sender, sent } = build(CURRENT_DRIVER)

    const result = await sender.send({
      body: 'Você já chegou na parada?',
      companyId: 'C1',
      groupJid: GROUP,
      tripId: 'T1',
    })

    expect(lookups).toEqual([{ companyId: 'C1', tripId: 'T1' }])
    expect(sent).toEqual([
      {
        body: `@${CURRENT_DRIVER} Você já chegou na parada?`,
        companyId: 'C1',
        mentionNumber: CURRENT_DRIVER,
        number: GROUP,
      },
    ])
    expect(result).toEqual({ providerMessageId: 'provider-1' })
  })

  test('troca de tripulação: marca quem é o atual no envio, nunca o da abertura', async () => {
    let current = FORMER_DRIVER
    const sent: string[] = []
    const sender = createGroupStopReminderSender({
      readCurrentDriverNumber: async () => current,
      sendText: async ({ mentionNumber }) => {
        sent.push(mentionNumber ?? 'none')
        return { providerMessageId: null }
      },
    })
    const params = { body: 'oi', companyId: 'C1', groupJid: GROUP, tripId: 'T1' }

    await sender.send(params)
    current = CURRENT_DRIVER
    await sender.send(params)

    expect(sent).toEqual([FORMER_DRIVER, CURRENT_DRIVER])
  })

  test('motorista sem telefone válido: sai sem marca, sem falhar', async () => {
    const { sender, sent } = build(undefined)

    await sender.send({ body: 'oi', companyId: 'C1', groupJid: GROUP, tripId: 'T1' })

    expect(sent).toEqual([{ body: 'oi', companyId: 'C1', number: GROUP }])
  })

  test('falha do envio sobe a quem chamou (a rotina decide) e não é engolida', async () => {
    const sender = createGroupStopReminderSender({
      readCurrentDriverNumber: async () => CURRENT_DRIVER,
      sendText: async () => {
        throw new Error('disconnected')
      },
    })

    await expect(
      sender.send({ body: 'oi', companyId: 'C1', groupJid: GROUP, tripId: 'T1' }),
    ).rejects.toThrow('disconnected')
  })
})
