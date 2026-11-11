/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318: a contratante com canal "WhatsApp (grupo)" recebe o aviso automático da ocorrência no grupo, marcando o
 * número, e **nenhum e-mail** (P1). Um aviso por ocorrência (RF3). Falha no grupo: tenta de novo a passageira, grava o
 * resultado e cai no e-mail de reserva se ele estiver ligado (P2). O texto é enxuto e sem dado sensível (RF4).
 */
import { describe, expect, test } from 'bun:test'

import { createAutomaticOccurrenceMailHook } from '../../src/occurrence-conversation/application/automatic-occurrence-mail.hook.js'
import { ContractorReplyWhatsAppSendError } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import {
  createSendAutomaticOccurrenceMailUseCase,
  type AutomaticOccurrenceMailPlan,
  type ContractorOccurrenceGroupPort,
} from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import type { SendOccurrenceMailInput } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import {
  CONTRACTOR_OCCURRENCE_GROUP_SUMMARY_MAX_LENGTH,
  buildContractorOccurrenceGroupMessage,
  summarizeOccurrenceNote,
} from '../../src/occurrence-conversation/domain/contractor-occurrence-group.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000318001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000318002'
const GROUP_JID = '120363000000000001@g.us'
const MENTION_PHONE = '5516999990000'
const TEMPLATE =
  '⚠️ *Ocorrência na {{momento}}* — NF {{numeroNota}}\nTipo: {{tipoOcorrencia}}\n📝 {{observacao}}'

function plan(overrides: Partial<AutomaticOccurrenceMailPlan> = {}): AutomaticOccurrenceMailPlan {
  return {
    chosenContactIds: [],
    emailsContractor: true,
    groupChannel: { emailFallback: true, groupJid: GROUP_JID, mentionPhone: MENTION_PHONE },
    isRegisteredBeforeTemplate: false,
    recipients: [
      {
        contactId: 'contact-email',
        email: 'compras@unica.example.test',
        preferredChannel: 'email',
        stages: ['delivery'],
      },
    ],
    stage: 'delivery',
    suggested: { bodyText: 'Caixa violada na NF 4512.', subject: 'Ocorrência — NF 4512' },
    ...overrides,
  }
}

type GroupCall = Parameters<ContractorOccurrenceGroupPort['send']>[0]
type RecordCall = Parameters<ContractorOccurrenceGroupPort['record']>[0]

function setup(input: {
  readonly claim?: boolean
  readonly failures?: readonly ContractorReplyWhatsAppSendError[]
  readonly plan: AutomaticOccurrenceMailPlan
  readonly template?: null | string
}) {
  const mails: SendOccurrenceMailInput[] = []
  const posts: GroupCall[] = []
  const records: RecordCall[] = []
  const sleeps: number[] = []
  const failures = [...(input.failures ?? [])]
  const useCase = createSendAutomaticOccurrenceMailUseCase({
    group: {
      claim: async () => input.claim ?? true,
      readMessage: async () =>
        input.template === null
          ? null
          : {
              template: input.template ?? TEMPLATE,
              values: {
                data: '10/11/2026 10:35',
                momento: 'entrega',
                numeroNota: '4512/1',
                numeroNotaSemSerie: '4512',
                observacao: 'Caixa violada',
                tipoOcorrencia: 'Avaria',
              },
            },
      record: async (call) => void records.push(call),
      send: async (call) => {
        posts.push(call)
        const failure = failures.shift()
        if (failure !== undefined) throw failure
        return { providerMessageId: 'msg-1' }
      },
    },
    reader: { findPlan: async () => input.plan },
    sendMail: {
      send: async (request) => {
        mails.push(request)
        return {
          conversationId: 'conversation-1',
          conversationMessageId: 'message-1',
          mailMessageId: 'mail-1',
          recipientCount: request.contactIds.length,
          threadId: 'thread-1',
        }
      },
    },
    sleep: async (milliseconds) => void sleeps.push(milliseconds),
  })
  const run = () =>
    useCase.send({
      companyId: COMPANY_ID,
      correlationId: 'correlation-1',
      occurrenceId: OCCURRENCE_ID,
    })
  return { mails, posts, records, run, sleeps }
}

const failed = () => new ContractorReplyWhatsAppSendError('failed')

describe('o aviso da ocorrência no grupo da contratante (spec 318)', () => {
  test('P1: posta no grupo marcando o número, e nenhum e-mail sai', async () => {
    const { mails, posts, records, run } = setup({ plan: plan() })

    expect(await run()).toEqual({ attempts: 1, outcome: 'sent_to_group' })
    expect(mails).toEqual([])
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      companyId: COMPANY_ID,
      groupJid: GROUP_JID,
      mentionNumber: MENTION_PHONE,
    })
    expect(posts[0]?.body.startsWith(`@${MENTION_PHONE}\n`)).toBe(true)
    expect(posts[0]?.body).toContain('NF 4512/1')
    expect(records).toEqual([
      expect.objectContaining({ attempts: 1, failure: null, status: 'sent' }),
    ])
  })

  test('P1: outra contratante (sem grupo) continua por e-mail, com a chave de sempre', async () => {
    const { mails, posts, run } = setup({ plan: plan({ groupChannel: null }) })

    expect(await run()).toMatchObject({ outcome: 'sent' })
    expect(posts).toEqual([])
    expect(mails[0]?.idempotencyKey).toBe(`occurrence-auto-mail:${OCCURRENCE_ID}`)
  })

  test('tipo que não avisa a contratante: nada sai, em nenhum canal', async () => {
    const { mails, posts, run } = setup({ plan: plan({ emailsContractor: false }) })

    expect(await run()).toEqual({ outcome: 'skipped', reason: 'type_off' })
    expect(posts).toEqual([])
    expect(mails).toEqual([])
  })

  test('spec 321 (D2, CA01/CA02): tipo que nunca avisa a contratante não reserva, não posta e não manda e-mail', async () => {
    const { mails, posts, records, run } = setup({
      plan: plan({ blocksContractorNotice: true, emailsContractor: true }),
    })

    expect(await run()).toEqual({ outcome: 'skipped', reason: 'contractor_notice_blocked' })
    expect(posts).toEqual([])
    expect(mails).toEqual([])
    expect(records).toEqual([])
  })

  test('RF3: reprocessar não duplica — a reserva já tomada não posta de novo', async () => {
    const { mails, posts, records, run } = setup({ claim: false, plan: plan() })

    expect(await run()).toEqual({ outcome: 'skipped', reason: 'group_already_sent' })
    expect(posts).toEqual([])
    expect(mails).toEqual([])
    expect(records).toEqual([])
  })

  test('o grupo não depende do modelo de e-mail do tipo', async () => {
    const { posts, run } = setup({ plan: plan({ suggested: null }) })

    expect(await run()).toEqual({ attempts: 1, outcome: 'sent_to_group' })
    expect(posts).toHaveLength(1)
  })

  test('P2: a falha passageira é tentada de novo, e passa', async () => {
    const { mails, posts, run, sleeps } = setup({ failures: [failed()], plan: plan() })

    expect(await run()).toEqual({ attempts: 2, outcome: 'sent_to_group' })
    expect(posts).toHaveLength(2)
    expect(sleeps).toEqual([2_000])
    expect(mails).toEqual([])
  })

  test('P2: esgotadas as tentativas, cai no e-mail de reserva e grava o resultado', async () => {
    const { mails, posts, records, run } = setup({
      failures: [failed(), failed(), failed()],
      plan: plan(),
    })

    const result = await run()

    expect(result).toMatchObject({
      failure: 'failed',
      fallback: { outcome: 'sent', recipientCount: 1 },
      outcome: 'group_failed',
    })
    expect(posts).toHaveLength(3)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.idempotencyKey).toBe(`occurrence-auto-mail:${OCCURRENCE_ID}`)
    expect(records).toEqual([
      expect.objectContaining({ attempts: 3, failure: 'failed', status: 'email_fallback' }),
    ])
  })

  test.each([
    ['bot fora do grupo / grupo apagado', 'number_not_found', 'group_not_found'],
    ['Evolution desligado ou fora do ar', 'disconnected', 'disconnected'],
  ] as const)('P2: %s não repete na hora e vai para a reserva', async (_, raw, failure) => {
    const { mails, posts, run, sleeps } = setup({
      failures: [new ContractorReplyWhatsAppSendError(raw)],
      plan: plan(),
    })

    expect(await run()).toMatchObject({ failure, outcome: 'group_failed' })
    expect(posts).toHaveLength(1)
    expect(sleeps).toEqual([])
    expect(mails).toHaveLength(1)
  })

  test('P2: reserva desligada — nenhum e-mail, resultado `failed` para a varredura tentar de novo', async () => {
    const { mails, records, run } = setup({
      failures: [new ContractorReplyWhatsAppSendError('disconnected')],
      plan: plan({
        groupChannel: { emailFallback: false, groupJid: GROUP_JID, mentionPhone: MENTION_PHONE },
      }),
    })

    expect(await run()).toEqual({
      failure: 'disconnected',
      fallback: null,
      outcome: 'group_failed',
    })
    expect(mails).toEqual([])
    expect(records).toEqual([
      expect.objectContaining({ failure: 'disconnected', status: 'failed' }),
    ])
  })

  test('sem modelo do grupo em Notificações: não posta e usa a reserva', async () => {
    const { mails, posts, records, run } = setup({ plan: plan(), template: null })

    expect(await run()).toMatchObject({ failure: 'template_missing', outcome: 'group_failed' })
    expect(posts).toEqual([])
    expect(mails).toHaveLength(1)
    expect(records).toEqual([expect.objectContaining({ attempts: 0, status: 'email_fallback' })])
  })

  test('a reserva que não sai (e-mail sem destinatário) deixa o resultado `failed`', async () => {
    const { records, run } = setup({
      failures: [new ContractorReplyWhatsAppSendError('disconnected')],
      plan: plan({ recipients: [] }),
    })

    expect(await run()).toMatchObject({
      fallback: { outcome: 'skipped', reason: 'no_recipient' },
      outcome: 'group_failed',
    })
    expect(records).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  test('o gancho alerta a falha do grupo sem grupo, número nem texto no log', async () => {
    const logs: { event: string; fields: Record<string, unknown>; level: string }[] = []
    const hook = createAutomaticOccurrenceMailHook({
      logger: {
        error: (event, fields) => void logs.push({ event, fields: fields ?? {}, level: 'error' }),
        info: (event, fields) => void logs.push({ event, fields: fields ?? {}, level: 'info' }),
      },
      useCase: {
        send: async ({ occurrenceId }) =>
          occurrenceId === 'a'
            ? { attempts: 1, outcome: 'sent_to_group' }
            : { failure: 'group_not_found', fallback: null, outcome: 'group_failed' },
      },
    })

    hook.announce({ companyId: COMPANY_ID, occurrenceIds: ['a', 'b'] })
    await hook.settled()

    expect(logs.map(({ event, level }) => `${level}:${event}`)).toEqual([
      'info:occurrence_contractor_group_sent',
      'error:occurrence_contractor_group_failed',
    ])
    expect(logs[1]?.fields).toMatchObject({ failure: 'group_not_found', fallback: 'off' })
    expect(JSON.stringify(logs)).not.toContain('@g.us')
    expect(JSON.stringify(logs)).not.toContain(MENTION_PHONE)
  })
})

describe('o texto do aviso no grupo (spec 318 RF2, RF4)', () => {
  const values = {
    data: '10/11/2026 10:35',
    momento: 'separação',
    numeroNota: '4512/1',
    numeroNotaSemSerie: '4512',
    observacao: '',
    tipoOcorrencia: 'Falta',
  } as const

  test('modelo sem {{marcacao}} ganha a marca na primeira linha', () => {
    expect(
      buildContractorOccurrenceGroupMessage({
        mentionPhone: MENTION_PHONE,
        template: 'Ocorrência na {{momento}}: NF {{numeroNota}} ({{tipoOcorrencia}})',
        values,
      }),
    ).toBe(`@${MENTION_PHONE}\nOcorrência na separação: NF 4512/1 (Falta)`)
  })

  test('modelo com {{marcacao}} põe a marca onde o modelo pede, uma vez só', () => {
    const body = buildContractorOccurrenceGroupMessage({
      mentionPhone: MENTION_PHONE,
      template: 'Olá {{marcacao}}, NF {{numeroNota}}',
      values,
    })

    expect(body).toBe(`Olá @${MENTION_PHONE}, NF 4512/1`)
  })

  test('só a lista fechada entra: variável de valor, CNPJ ou destinatário sai vazia', () => {
    const body = buildContractorOccurrenceGroupMessage({
      mentionPhone: MENTION_PHONE,
      template: '{{marcacao}} NF {{numeroNota}} {{valorNota}}{{cnpjContratante}}{{razaoSocial}}',
      values: { ...values, valorNota: '7.840,64' } as typeof values,
    })

    expect(body).toBe(`@${MENTION_PHONE} NF 4512/1`)
  })

  test('linha de rótulo com emoji e variável vazia some', () => {
    const body = buildContractorOccurrenceGroupMessage({
      mentionPhone: MENTION_PHONE,
      template: 'NF {{numeroNota}}\n📝 {{observacao}}\nFim',
      values,
    })

    expect(body).toBe(`@${MENTION_PHONE}\nNF 4512/1\nFim`)
  })

  test('o resumo é a observação compacta e cortada', () => {
    expect(summarizeOccurrenceNote('  caixa\n\n  violada  ')).toBe('caixa violada')
    const long = summarizeOccurrenceNote(
      'a'.repeat(CONTRACTOR_OCCURRENCE_GROUP_SUMMARY_MAX_LENGTH + 50),
    )
    expect(long).toHaveLength(CONTRACTOR_OCCURRENCE_GROUP_SUMMARY_MAX_LENGTH)
    expect(long.endsWith('…')).toBe(true)
  })
})
