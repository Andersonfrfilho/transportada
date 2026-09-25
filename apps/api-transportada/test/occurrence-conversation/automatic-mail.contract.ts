/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T802 (absorve a 143 T025): a ocorrência registrada com um tipo que "manda e-mail à
 * contratante" (`emails_contractor`) avisa a contratante sozinha, pelo canal preferido de cada contato
 * que recebe ocorrência daquela etapa, com o texto do tipo (079). Enquanto o WhatsApp não envia (T002),
 * quem prefere WhatsApp e tem e-mail recebe por e-mail — contado, nunca em silêncio. O aviso é um só por
 * ocorrência (chave de idempotência dela), sem autor humano, e **não decide nada** (D4). Qualquer
 * motivo para não enviar é resultado, não erro: o registro da ocorrência nunca cai por causa dele.
 */
import { describe, expect, test } from 'bun:test'

import { createAutomaticOccurrenceMailHook } from '../../src/occurrence-conversation/application/automatic-occurrence-mail.hook.js'
import {
  createSendAutomaticOccurrenceMailUseCase,
  type AutomaticOccurrenceMailPlan,
} from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { ContractorMailNotConfiguredError } from '../../src/contractor-mail/domain/contractor-mail.error.js'
import type { SendOccurrenceMailInput } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000180201'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000180202'

function plan(overrides: Partial<AutomaticOccurrenceMailPlan> = {}): AutomaticOccurrenceMailPlan {
  return {
    emailsContractor: true,
    recipients: [
      {
        contactId: 'contact-email',
        email: 'compras@alfa.example.test',
        preferredChannel: 'email',
        stages: ['delivery'],
      },
      {
        contactId: 'contact-whatsapp',
        email: 'fiscal@alfa.example.test',
        preferredChannel: 'whatsapp',
        stages: ['delivery', 'separation'],
      },
      {
        contactId: 'contact-whatsapp-only',
        email: null,
        preferredChannel: 'whatsapp',
        stages: ['delivery'],
      },
      {
        contactId: 'contact-other-stage',
        email: 'estoque@alfa.example.test',
        preferredChannel: 'email',
        stages: ['separation'],
      },
    ],
    stage: 'delivery',
    suggested: { bodyText: 'Caixa violada na NF 4512.', subject: 'Ocorrência — NF 4512' },
    ...overrides,
  }
}

function setup(input: {
  readonly plan: AutomaticOccurrenceMailPlan | null
  readonly fail?: Error
}) {
  const sent: SendOccurrenceMailInput[] = []
  const useCase = createSendAutomaticOccurrenceMailUseCase({
    reader: { findPlan: async () => input.plan },
    sendMail: {
      send: async (request) => {
        sent.push(request)
        if (input.fail !== undefined) throw input.fail
        return {
          conversationId: 'conversation-1',
          conversationMessageId: 'message-1',
          mailMessageId: 'mail-1',
          recipientCount: request.contactIds.length,
          threadId: 'thread-1',
        }
      },
    },
  })
  const run = () =>
    useCase.send({
      companyId: COMPANY_ID,
      correlationId: 'correlation-1',
      occurrenceId: OCCURRENCE_ID,
    })
  return { run, sent }
}

describe('o aviso automático à contratante (spec 183 T802)', () => {
  test('os contatos da etapa, pelo e-mail; quem prefere WhatsApp e tem e-mail vai por e-mail e é contado', async () => {
    const { run, sent } = setup({ plan: plan() })

    expect(await run()).toEqual({
      outcome: 'sent',
      recipientCount: 2,
      whatsappFallbackCount: 1,
      whatsappUnreachableCount: 1,
    })
    expect(sent).toEqual([
      {
        actorUserId: null,
        automatic: true,
        bodyText: 'Caixa violada na NF 4512.',
        companyId: COMPANY_ID,
        contactIds: ['contact-email', 'contact-whatsapp'],
        correlationId: 'correlation-1',
        idempotencyKey: `occurrence-auto-mail:${OCCURRENCE_ID}`,
        occurrenceId: OCCURRENCE_ID,
        subject: 'Ocorrência — NF 4512',
      },
    ])
  })

  test.each([
    ['ocorrência de parada ou inexistente', null, 'not_document'],
    ['tipo sem o envio ligado', plan({ emailsContractor: false }), 'type_off'],
    ['tipo sem texto de e-mail', plan({ suggested: null }), 'no_template'],
    [
      'nenhum contato da etapa com e-mail',
      plan({
        recipients: [
          { contactId: 'c', email: null, preferredChannel: 'whatsapp', stages: ['delivery'] },
          {
            contactId: 'd',
            email: 'x@alfa.example.test',
            preferredChannel: 'email',
            stages: ['separation'],
          },
        ],
      }),
      'no_recipient',
    ],
  ] as const)('%s: não envia, e diz por quê', async (_, value, reason) => {
    const { run, sent } = setup({ plan: value })

    expect(await run()).toMatchObject({ outcome: 'skipped', reason })
    expect(sent).toEqual([])
  })

  test('e-mail da empresa não configurado: não envia, sem derrubar o registro', async () => {
    const { run } = setup({ fail: new ContractorMailNotConfiguredError(), plan: plan() })

    expect(await run()).toEqual({ outcome: 'skipped', reason: 'mail_not_ready' })
  })

  test('outro erro sobe: o chamador registra e segue (falha não é "não configurado")', async () => {
    const { run } = setup({ fail: new Error('database down'), plan: plan() })

    await expect(run()).rejects.toThrow('database down')
  })
})

describe('o gancho do registro (spec 183 T802)', () => {
  test('anuncia cada ocorrência registrada, depois do commit, e nunca derruba o registro', async () => {
    const calls: string[] = []
    const logs: { event: string; fields: Record<string, unknown> }[] = []
    const hook = createAutomaticOccurrenceMailHook({
      logger: {
        error: (event, fields) => void logs.push({ event, fields: fields ?? {} }),
        info: (event, fields) => void logs.push({ event, fields: fields ?? {} }),
      },
      useCase: {
        send: async ({ occurrenceId }) => {
          calls.push(occurrenceId)
          if (occurrenceId === 'occurrence-2') throw new Error('compras@alfa.example.test caiu')
          return { outcome: 'skipped', reason: 'type_off' }
        },
      },
    })

    expect(() =>
      hook.announce({ companyId: COMPANY_ID, occurrenceIds: ['occurrence-1', 'occurrence-2'] }),
    ).not.toThrow()
    await hook.settled()

    expect(calls).toEqual(['occurrence-1', 'occurrence-2'])
    expect(logs.map((log) => log.event).sort()).toEqual([
      'occurrence_automatic_mail_failed',
      'occurrence_automatic_mail_skipped',
    ])
    /** Nenhum log leva endereço, texto ou mensagem de erro — só códigos e ids. */
    expect(JSON.stringify(logs)).not.toContain('@')
  })
})
