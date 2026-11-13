/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T1b (D10): o modelo geral do aviso manual, `ocorrencia.contratante-aviso-manual`.
 *
 * - Os dois arquivos versionados (e-mail HTML e texto WhatsApp) passam na validação de envio e na régua de variáveis:
 *   só a lista fechada do aviso no grupo mais a moldura do sistema; nunca CPF, CNPJ, telefone nem motorista.
 * - Só o botão cai nele: o envio manual passa a chave ao e-mail (`templateFallbackKey`) e ao grupo
 *   (`fallbackTemplateKey`); o automático nunca passa, então nada muda nele.
 * - O publicador o grava pelos dois canais, com a mesma chave em posições diferentes do plano.
 */
import { describe, expect, test } from 'bun:test'

import {
  planOccurrenceMailTemplatePublication,
  publishOccurrenceMailTemplates,
  readOccurrenceMailTemplateFiles,
  readOccurrenceWhatsappTemplateFiles,
  type OccurrenceMailTemplatePublishRepository,
} from '../../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'
import {
  createSendAutomaticOccurrenceMailUseCase,
  type AutomaticOccurrenceMailPlan,
  type ContractorOccurrenceGroupPort,
} from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import type { SendOccurrenceMailInput } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import {
  assessManualNoticeEmailTemplate,
  assessManualNoticeWhatsappTemplate,
  CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY,
} from '../../src/occurrence-conversation/domain/contractor-manual-notice-template.policy.js'
import { buildContractorOccurrenceGroupMessage } from '../../src/occurrence-conversation/domain/contractor-occurrence-group.policy.js'
import {
  assessContractorTemplate,
  blocksContractorMailSend,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-template.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000324101'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000324102'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000324103'

/** Variável com dado de pessoa ou documento: nunca no modelo geral (D10). */
const FORBIDDEN_VARIABLES = [
  'cnpjContratante',
  'cnpjTransportadora',
  'motorista',
  'cpf',
  'telefone',
  'numeroReferencia',
]

function emailTemplate() {
  const template = readOccurrenceMailTemplateFiles().find(
    (candidate) => candidate.key === CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY,
  )
  if (template === undefined) throw new Error('sem o e-mail do aviso manual')
  return template
}

function whatsappTemplate() {
  const template = readOccurrenceWhatsappTemplateFiles().find(
    (candidate) => candidate.key === CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY,
  )
  if (template === undefined) throw new Error('sem o texto WhatsApp do aviso manual')
  return template
}

function placeholders(text: string): readonly string[] {
  return [...text.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu)].map((match) => match[1] ?? '')
}

describe('o modelo geral do aviso manual: os arquivos (spec 324 T1b)', () => {
  test('a chave é ocorrencia.contratante-aviso-manual, no e-mail e no WhatsApp', () => {
    expect(CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY).toBe('ocorrencia.contratante-aviso-manual')
    expect(emailTemplate().channel ?? 'email').toBe('email')
    expect(whatsappTemplate().channel).toBe('whatsapp')
  })

  test('o e-mail passa na validação de envio e na régua do aviso manual, sem problema algum', () => {
    const template = emailTemplate()
    const problems = assessContractorTemplate({ key: template.key, template })
    expect(problems).toEqual([])
    expect(blocksContractorMailSend(problems)).toBe(false)
    expect(assessManualNoticeEmailTemplate(template)).toEqual([])
    expect(template.subject).toContain('{{numeroNota}}')
    expect(template.body).toContain('<!-- mensagem -->')
  })

  test('o WhatsApp passa na régua: texto, sem HTML, só variáveis do aviso no grupo', () => {
    expect(assessManualNoticeWhatsappTemplate(whatsappTemplate())).toEqual([])
  })

  test('nenhum dos dois usa CPF, CNPJ, telefone, motorista nem número do documento do cliente', () => {
    const used = [
      ...placeholders(emailTemplate().subject),
      ...placeholders(emailTemplate().body),
      ...placeholders(whatsappTemplate().body),
    ]
    for (const name of FORBIDDEN_VARIABLES) expect(used).not.toContain(name)
  })

  test('a régua recusa variável fora da lista, HTML no WhatsApp e texto vazio', () => {
    expect(
      assessManualNoticeEmailTemplate({ body: '<p>{{cnpjContratante}}</p>', subject: 'NF' }),
    ).toEqual([{ code: 'variables_outside_manual_notice', variables: ['cnpjContratante'] }])
    expect(assessManualNoticeWhatsappTemplate({ body: '<b>{{telefone}}</b>' })).toEqual([
      { code: 'html_not_allowed' },
      { code: 'variables_outside_manual_notice', variables: ['telefone'] },
    ])
    expect(assessManualNoticeWhatsappTemplate({ body: '  ' })).toEqual([{ code: 'empty_body' }])
    expect(assessManualNoticeWhatsappTemplate({ body: 'NF {{ numeroNota }' })).toEqual([
      { code: 'malformed_placeholder' },
    ])
  })

  test('o texto WhatsApp renderiza com a marca e tira a linha do vencimento sem data', () => {
    const message = buildContractorOccurrenceGroupMessage({
      mentionPhone: '5516999990324',
      template: whatsappTemplate().body,
      values: {
        cliente: 'Mercado Exemplo',
        contratante: 'Contratante Exemplo',
        data: '13/11/2026 10:00',
        enderecoEntrega: 'Rua A, 10 — Cidade/SP',
        momento: 'entrega',
        novaData: '',
        numeroNota: '4512/1',
        numeroNotaSemSerie: '4512',
        observacao: 'Portão fechado.',
        tipoOcorrencia: 'Local fechado',
        valorNota: '1.234,56',
      },
    })
    expect(message.startsWith('@5516999990324')).toBe(true)
    expect(message).toContain('*Tipo:* Local fechado')
    expect(message).toContain('*Nota fiscal:* 4512/1')
    expect(message).not.toContain('Vencimento pedido')
    expect(message).not.toContain('{{')
  })
})

describe('o publicador grava o modelo geral nos dois canais (spec 324 T1b)', () => {
  type Row = {
    body: string
    channel: string
    key: string
    subject: null | string
    version: number
  }

  function memoryRepository(rows: Row[]) {
    const writes: { channel: string; key: string; subject: string | undefined }[] = []
    const repository: OccurrenceMailTemplatePublishRepository = {
      findActive: async ({ channel, key }) =>
        rows
          .filter((row) => row.key === key && row.channel === channel)
          .sort((a, b) => b.version - a.version)[0],
      upsert: async (input) => {
        const version =
          Math.max(
            0,
            ...rows
              .filter((row) => row.key === input.key && row.channel === input.channel)
              .map((row) => row.version),
          ) + 1
        rows.push({
          body: input.body,
          channel: input.channel,
          key: input.key,
          subject: input.subject ?? null,
          version,
        })
        writes.push({ channel: input.channel, key: input.key, subject: input.subject })
        return { version }
      },
    }
    return { repository, writes }
  }

  const templates = [emailTemplate(), whatsappTemplate()]

  test('sem confirm só planeja: create nos dois canais, nada gravado', async () => {
    const { repository, writes } = memoryRepository([])
    const plan = await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: false,
      overwrite: [],
      repository,
      templates,
    })
    expect(plan.entries.map((entry) => [entry.key, entry.channel, entry.verdict])).toEqual([
      [CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY, 'email', 'create'],
      [CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY, 'whatsapp', 'create'],
    ])
    expect(writes).toEqual([])
  })

  test('com confirm grava a versão 1 de cada canal; o WhatsApp sem assunto; a segunda rodada é same', async () => {
    const rows: Row[] = []
    const { repository, writes } = memoryRepository(rows)
    const first = await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: true,
      overwrite: [],
      repository,
      templates,
    })
    expect(first.entries.map((entry) => entry.writtenVersion)).toEqual([1, 1])
    expect(writes).toEqual([
      {
        channel: 'email',
        key: CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY,
        subject: emailTemplate().subject,
      },
      { channel: 'whatsapp', key: CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY, subject: undefined },
    ])
    const second = await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: true,
      overwrite: [],
      repository,
      templates,
    })
    expect(second.entries.map((entry) => entry.verdict)).toEqual(['same', 'same'])
    expect(writes).toHaveLength(2)
  })

  test('o WhatsApp personalizado na tela é differs e só vira versão nova com --overwrite', async () => {
    const rows: Row[] = [
      {
        body: 'texto da tela',
        channel: 'whatsapp',
        key: CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY,
        subject: null,
        version: 3,
      },
    ]
    const { repository, writes } = memoryRepository(rows)
    const plan = await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: true,
      overwrite: [],
      repository,
      templates: [whatsappTemplate()],
    })
    expect(plan.entries[0]?.verdict).toBe('differs')
    expect(writes).toEqual([])
  })

  test('um texto WhatsApp inválido recusa a publicação inteira', () => {
    const plan = planOccurrenceMailTemplatePublication({
      active: new Map(),
      overwrite: [],
      templates: [emailTemplate(), { ...whatsappTemplate(), body: '<b>{{cnpjContratante}}</b>' }],
    })
    expect(plan.entries).toEqual([])
    expect(plan.invalid.map((item) => item.key)).toEqual([
      `whatsapp:${CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY}`,
    ])
  })
})

describe('só o botão cai no modelo geral (spec 324 T1b, D10)', () => {
  function plan(overrides: Partial<AutomaticOccurrenceMailPlan> = {}): AutomaticOccurrenceMailPlan {
    return {
      blocksContractorNotice: false,
      chosenContactIds: [],
      emailsContractor: true,
      groupChannel: null,
      isRegisteredBeforeTemplate: false,
      recipients: [
        {
          contactId: 'contact-delivery',
          email: 'ocorrencias@contratante.example.test',
          preferredChannel: 'email',
          stages: ['delivery'],
        },
      ],
      stage: 'delivery',
      suggested: { bodyText: 'Aviso.', subject: 'Aviso — NF 4512' },
      ...overrides,
    }
  }

  function setup(planned: AutomaticOccurrenceMailPlan) {
    const mails: SendOccurrenceMailInput[] = []
    const reads: Parameters<ContractorOccurrenceGroupPort['readMessage']>[0][] = []
    const useCase = createSendAutomaticOccurrenceMailUseCase({
      group: {
        claim: async () => true,
        readMessage: async (call) => {
          reads.push(call)
          return {
            template: '{{tipoOcorrencia}} — NF {{numeroNota}}',
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
          }
        },
        record: async () => {},
        send: async () => ({}),
      },
      manualNotice: {
        claim: async () => true,
        isAutomaticNoticeSent: async () => false,
        isManualNoticeSent: async () => false,
        readNoticeRecord: async () => ({ automatic: null, manual: null }),
        record: async () => {},
      },
      reader: { findPlan: async () => planned },
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
      sleep: async () => {},
    })
    const input = { companyId: COMPANY_ID, correlationId: 'c-324', occurrenceId: OCCURRENCE_ID }
    return {
      automatic: () => useCase.send(input),
      mails,
      manual: () => useCase.sendManual({ ...input, actorUserId: ACTOR_USER_ID }),
      reads,
    }
  }

  const GROUP = {
    emailFallback: true,
    groupJid: '120363000000000324@g.us',
    mentionPhone: '5516999990324',
  }

  test('e-mail: o botão passa a chave geral ao envio; o automático não', async () => {
    const manual = setup(plan())
    await manual.manual()
    expect(manual.mails[0]?.templateFallbackKey).toBe(CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY)

    const automatic = setup(plan())
    await automatic.automatic()
    expect(automatic.mails).toHaveLength(1)
    expect('templateFallbackKey' in (automatic.mails[0] ?? {})).toBe(false)
  })

  test('grupo: o botão lê o modelo com a chave geral por último; o automático lê como sempre', async () => {
    const manual = setup(plan({ groupChannel: GROUP }))
    await manual.manual()
    expect(manual.reads).toEqual([
      expect.objectContaining({ fallbackTemplateKey: CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY }),
    ])

    const automatic = setup(plan({ groupChannel: GROUP }))
    await automatic.automatic()
    expect(automatic.reads).toHaveLength(1)
    expect('fallbackTemplateKey' in (automatic.reads[0] ?? {})).toBe(false)
  })
})
