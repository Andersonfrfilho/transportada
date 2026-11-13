/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T1: o botão "Avisar a contratante" (`sendManual`). Manda uma vez o mesmo aviso que o automático mandaria
 * (mesmo plano, modelo e canal), com o tipo desligado (CA01), no grupo da 318 (CA02) ou por e-mail aos contatos da
 * etapa (CA03); o segundo clique é recusado e a falha libera de novo (CA04); o tipo marcado pela 321 nunca avisa (CA05).
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX,
  createSendAutomaticOccurrenceMailUseCase,
  describeManualNoticeAttempt,
  isManualNoticeDelivered,
  type AutomaticOccurrenceMailPlan,
  type ContractorOccurrenceGroupPort,
  type ManualContractorNoticePort,
} from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import type { SendOccurrenceMailInput } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { CONTRACTOR_MANUAL_NOTICE_OPERATION } from '../../src/occurrence-conversation/domain/occurrence-conversation.constant.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'

const WORKER_SWEEP_CONSTANTS = new URL(
  '../../../worker-transportada/src/occurrence-automatic-mail-sweep/domain/occurrence-automatic-mail-sweep.constant.ts',
  import.meta.url,
)

const COMPANY_ID = '00000000-0000-4000-8000-000000324001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000324002'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000324003'
const GROUP_JID = '120363000000000324@g.us'
const MENTION_PHONE = '5516999990324'

function plan(overrides: Partial<AutomaticOccurrenceMailPlan> = {}): AutomaticOccurrenceMailPlan {
  return {
    blocksContractorNotice: false,
    chosenContactIds: [],
    emailsContractor: false,
    groupChannel: null,
    isRegisteredBeforeTemplate: false,
    recipients: [
      {
        contactId: 'contact-delivery',
        email: 'ocorrencias@contratante.example.test',
        preferredChannel: 'email',
        stages: ['delivery'],
      },
      {
        contactId: 'contact-separation',
        email: 'separacao@contratante.example.test',
        preferredChannel: 'email',
        stages: ['separation'],
      },
    ],
    stage: 'delivery',
    suggested: { bodyText: 'Local fechado na NF 4512.', subject: 'Ocorrência — NF 4512' },
    ...overrides,
  }
}

type ClaimCall = Parameters<ContractorOccurrenceGroupPort['claim']>[0]
type RecordCall = Parameters<ManualContractorNoticePort['record']>[0]

function setup(input: {
  readonly automaticSent?: boolean
  readonly claims?: readonly boolean[]
  readonly mailError?: Error
  readonly manualSent?: boolean
  readonly plan: AutomaticOccurrenceMailPlan | null
}) {
  const mails: SendOccurrenceMailInput[] = []
  const posts: string[] = []
  const groupClaims: ClaimCall[] = []
  const groupRecords: Parameters<ContractorOccurrenceGroupPort['record']>[0][] = []
  const planCalls: Parameters<
    Parameters<typeof createSendAutomaticOccurrenceMailUseCase>[0]['reader']['findPlan']
  >[0][] = []
  const records: RecordCall[] = []
  const claims = [...(input.claims ?? [true])]
  let manualClaims = 0
  const useCase = createSendAutomaticOccurrenceMailUseCase({
    group: {
      claim: async (call) => {
        groupClaims.push(call)
        return true
      },
      readMessage: async () => ({
        template: 'Ocorrência — NF {{numeroNota}} ({{tipoOcorrencia}})',
        values: {
          cliente: '',
          contratante: '',
          data: '',
          enderecoEntrega: '',
          momento: 'entrega',
          novaData: '',
          numeroNota: '4512/1',
          numeroNotaSemSerie: '4512',
          observacao: '',
          tipoOcorrencia: 'Local fechado',
          valorNota: '',
        },
      }),
      record: async (call) => void groupRecords.push(call),
      send: async (call) => {
        posts.push(call.body)
        return {}
      },
    },
    manualNotice: {
      claim: async () => {
        manualClaims += 1
        return claims.shift() ?? true
      },
      isAutomaticNoticeSent: async () => input.automaticSent ?? false,
      isManualNoticeSent: async () => input.manualSent ?? false,
      record: async (call) => void records.push(call),
    },
    reader: {
      findPlan: async (call) => {
        planCalls.push(call)
        return input.plan
      },
    },
    sendMail: {
      send: async (request) => {
        mails.push(request)
        if (input.mailError !== undefined) throw input.mailError
        return {
          conversationId: 'conversation-1',
          conversationMessageId: 'message-1',
          mailMessageId: 'mail-1',
          recipientCount: request.contactIds.length,
          threadId: 'thread-1',
        }
      },
    },
    sleep: async () => {},
  })
  const manual = () =>
    useCase.sendManual({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      correlationId: 'correlation-324',
      occurrenceId: OCCURRENCE_ID,
    })
  const automatic = () =>
    useCase.send({
      companyId: COMPANY_ID,
      correlationId: 'correlation-324',
      occurrenceId: OCCURRENCE_ID,
    })
  return {
    automatic,
    groupClaims,
    groupRecords,
    mails,
    manual,
    manualClaims: () => manualClaims,
    planCalls,
    posts,
    records,
  }
}

describe('o botão "Avisar a contratante" (spec 324 T1)', () => {
  test('CA01: tipo com aviso desligado — o botão envia; o automático continua type_off', async () => {
    const fixture = setup({ plan: plan({ emailsContractor: false }) })

    expect(await fixture.automatic()).toEqual({ outcome: 'skipped', reason: 'type_off' })
    expect(fixture.mails).toEqual([])

    expect(await fixture.manual()).toEqual({
      outcome: 'sent',
      recipientCount: 1,
      whatsappFallbackCount: 0,
      whatsappUnreachableCount: 0,
    })
    expect(fixture.planCalls.at(-1)).toEqual({
      companyId: COMPANY_ID,
      ignoreTypeOff: true,
      occurrenceId: OCCURRENCE_ID,
    })
    expect(fixture.records).toEqual([
      expect.objectContaining({ actorUserId: ACTOR_USER_ID, status: 'sent' }),
    ])
  })

  test('CA02: contratante em grupo — posta no grupo pela chave do botão e nenhum e-mail sai', async () => {
    const fixture = setup({
      plan: plan({
        groupChannel: { emailFallback: true, groupJid: GROUP_JID, mentionPhone: MENTION_PHONE },
      }),
    })

    expect(await fixture.manual()).toEqual({ attempts: 1, outcome: 'sent_to_group' })
    expect(fixture.mails).toEqual([])
    expect(fixture.posts).toHaveLength(1)
    expect(fixture.posts[0]).toContain('NF 4512/1')
    expect(fixture.groupClaims).toEqual([
      expect.objectContaining({ keyPrefix: MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX }),
    ])
    expect(fixture.groupRecords).toEqual([
      expect.objectContaining({ keyPrefix: MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX, status: 'sent' }),
    ])
    expect(fixture.records).toEqual([expect.objectContaining({ status: 'sent' })])
  })

  test('CA03: contratante por e-mail — o modelo do plano aos contatos da etapa, com o operador como autor', async () => {
    const fixture = setup({ plan: plan() })

    await fixture.manual()

    expect(fixture.mails).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        automatic: false,
        bodyText: 'Local fechado na NF 4512.',
        companyId: COMPANY_ID,
        contactIds: ['contact-delivery'],
        correlationId: 'correlation-324',
        idempotencyKey: `${MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX}${OCCURRENCE_ID}`,
        occurrenceId: OCCURRENCE_ID,
        subject: 'Ocorrência — NF 4512',
      },
    ])
  })

  test('o carimbo da escolha do modelo só segura o automático, nunca o botão', async () => {
    const fixture = setup({ plan: plan({ isRegisteredBeforeTemplate: true }) })

    expect((await fixture.manual()).outcome).toBe('sent')
    expect(fixture.mails).toHaveLength(1)
  })

  test('CA04: o segundo clique é recusado sem enviar', async () => {
    const fixture = setup({ claims: [true, false], plan: plan() })

    expect((await fixture.manual()).outcome).toBe('sent')
    expect(await fixture.manual()).toEqual({ by: 'manual', outcome: 'already_notified' })
    expect(fixture.mails).toHaveLength(1)
    expect(fixture.records).toHaveLength(1)
  })

  test('CA04: sem destinatário não envia, diz o motivo e libera tentar de novo', async () => {
    const fixture = setup({ plan: plan({ recipients: [] }) })

    expect(await fixture.manual()).toEqual({ outcome: 'skipped', reason: 'no_recipient' })
    expect(fixture.records).toEqual([
      expect.objectContaining({
        result: { outcome: 'skipped', reason: 'no_recipient' },
        status: 'failed',
      }),
    ])
  })

  test('CA04: falha inesperada grava failed e sobe', async () => {
    const fixture = setup({ mailError: new Error('provider down'), plan: plan() })

    await expect(fixture.manual()).rejects.toThrow('provider down')
    expect(fixture.records).toEqual([expect.objectContaining({ result: null, status: 'failed' })])
  })

  test('a chave do botão com outro texto (o aviso já saiu antes): fecha a reserva e responde já avisada', async () => {
    const fixture = setup({
      mailError: new OccurrenceConversationIdempotencyKeyReusedError(),
      plan: plan(),
    })

    expect(await fixture.manual()).toEqual({ by: 'manual', outcome: 'already_notified' })
    expect(fixture.records).toEqual([expect.objectContaining({ status: 'sent' })])
  })

  test('o grupo falhou sem reserva por e-mail: falha, e o próximo clique pode tentar de novo', async () => {
    const fixture = setup({
      plan: plan({
        groupChannel: { emailFallback: false, groupJid: GROUP_JID, mentionPhone: MENTION_PHONE },
      }),
    })
    const failingGroup = createSendAutomaticOccurrenceMailUseCase({
      group: {
        claim: async () => true,
        readMessage: async () => null,
        record: async () => {},
        send: async () => ({}),
      },
      manualNotice: {
        claim: async () => true,
        isAutomaticNoticeSent: async () => false,
        isManualNoticeSent: async () => false,
        record: async (call) => void fixture.records.push(call),
      },
      reader: {
        findPlan: async () =>
          plan({
            groupChannel: {
              emailFallback: false,
              groupJid: GROUP_JID,
              mentionPhone: MENTION_PHONE,
            },
          }),
      },
      sendMail: { send: async () => ({}) as never },
    })

    expect(
      await failingGroup.sendManual({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        correlationId: 'correlation-324',
        occurrenceId: OCCURRENCE_ID,
      }),
    ).toEqual({ failure: 'template_missing', fallback: null, outcome: 'group_failed' })
    expect(fixture.records).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  test('CA05: tipo marcado pela 321 (canhoto retido) — bloqueado antes de reservar ou enviar', async () => {
    const fixture = setup({
      plan: plan({ blocksContractorNotice: true, recipients: [], suggested: null }),
    })

    expect(await fixture.manual()).toEqual({ outcome: 'blocked' })
    expect(fixture.manualClaims()).toBe(0)
    expect(fixture.mails).toEqual([])
    expect(fixture.posts).toEqual([])
  })

  test('ocorrência de parada ou sem contratante: not_document, sem reservar', async () => {
    const fixture = setup({ plan: null })

    expect(await fixture.manual()).toEqual({ outcome: 'not_document' })
    expect(fixture.manualClaims()).toBe(0)
  })

  test('D8: tipo com aviso ligado já avisado pelo automático — recusa sem reservar', async () => {
    const fixture = setup({ automaticSent: true, plan: plan({ emailsContractor: true }) })

    expect(await fixture.manual()).toEqual({ by: 'automatic', outcome: 'already_notified' })
    expect(fixture.manualClaims()).toBe(0)
    expect(fixture.mails).toEqual([])
  })

  test('D8: tipo com aviso ligado cujo automático não saiu — o botão envia', async () => {
    const fixture = setup({ automaticSent: false, plan: plan({ emailsContractor: true }) })

    expect((await fixture.manual()).outcome).toBe('sent')
  })

  test('depois do botão, a varredura do automático não manda de novo', async () => {
    const fixture = setup({ manualSent: true, plan: plan({ emailsContractor: true }) })

    expect(await fixture.automatic()).toEqual({ outcome: 'skipped', reason: 'manual_notice_sent' })
    expect(fixture.mails).toEqual([])
  })

  test('só o que chegou à contratante fecha o aviso manual', () => {
    expect(
      isManualNoticeDelivered({
        outcome: 'sent',
        recipientCount: 1,
        whatsappFallbackCount: 0,
        whatsappUnreachableCount: 0,
      }),
    ).toBe(true)
    expect(isManualNoticeDelivered({ attempts: 1, outcome: 'sent_to_group' })).toBe(true)
    expect(
      isManualNoticeDelivered({
        failure: 'failed',
        fallback: {
          outcome: 'sent',
          recipientCount: 1,
          whatsappFallbackCount: 0,
          whatsappUnreachableCount: 0,
        },
        outcome: 'group_failed',
      }),
    ).toBe(true)
    expect(
      isManualNoticeDelivered({ failure: 'failed', fallback: null, outcome: 'group_failed' }),
    ).toBe(false)
    expect(isManualNoticeDelivered({ outcome: 'skipped', reason: 'mail_not_ready' })).toBe(false)
  })

  /** A varredura do worker exclui quem o botão já avisou: a operação e a chave são cópia por valor. */
  test('paridade com a fila da varredura do worker', async () => {
    const source = await readFile(WORKER_SWEEP_CONSTANTS, 'utf8')

    expect(source).toContain(`'${CONTRACTOR_MANUAL_NOTICE_OPERATION}'`)
    expect(source).toContain(
      `OCCURRENCE_CONTRACTOR_MANUAL_NOTICE_KEY_PREFIX = '${MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX}'`,
    )
  })

  test('T2: o registro leva o correlation id da requisição', async () => {
    const fixture = setup({ plan: plan() })

    await fixture.manual()
    expect(fixture.records).toEqual([
      expect.objectContaining({ correlationId: expect.any(String) as unknown, status: 'sent' }),
    ])
  })

  test('T2: o canal e o motivo que o registro guarda, para cada desfecho', () => {
    const sent = {
      outcome: 'sent',
      recipientCount: 1,
      whatsappFallbackCount: 0,
      whatsappUnreachableCount: 0,
    } as const
    expect(describeManualNoticeAttempt({ result: sent, status: 'sent' })).toEqual({
      channel: 'email',
      reason: null,
    })
    expect(
      describeManualNoticeAttempt({
        result: { attempts: 2, outcome: 'sent_to_group' },
        status: 'sent',
      }),
    ).toEqual({ channel: 'whatsapp_group', reason: null })
    expect(
      describeManualNoticeAttempt({
        result: { failure: 'disconnected', fallback: sent, outcome: 'group_failed' },
        status: 'sent',
      }),
    ).toEqual({ channel: 'email_fallback', reason: 'disconnected' })
    expect(
      describeManualNoticeAttempt({
        result: { failure: 'template_missing', fallback: null, outcome: 'group_failed' },
        status: 'failed',
      }),
    ).toEqual({ channel: 'whatsapp_group', reason: 'template_missing' })
    expect(
      describeManualNoticeAttempt({
        result: { outcome: 'skipped', reason: 'no_recipient' },
        status: 'failed',
      }),
    ).toEqual({ channel: null, reason: 'no_recipient' })
    /** O envio lançou: nada se afirma. A chave do e-mail já usada: o e-mail saiu antes. */
    expect(describeManualNoticeAttempt({ result: null, status: 'failed' })).toEqual({
      channel: null,
      reason: null,
    })
    expect(describeManualNoticeAttempt({ result: null, status: 'sent' })).toEqual({
      channel: 'email',
      reason: null,
    })
  })
})
