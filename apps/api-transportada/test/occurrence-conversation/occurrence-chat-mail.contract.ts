/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.6 (ADR-0111, D5/D6/D10/D11): o chat da contratante por e-mail. O renderer do modelo padrão é um dublê
 * da porta do app (o pacote ainda não está ligado); o resto da transação é o fake em memória.
 */
import { describe, expect, test } from 'bun:test'

import {
  createContractorPortalChatNotice,
  selectPortalChatNoticeRecipients,
} from '../../src/occurrence-conversation/application/contractor-portal-chat-notice.service.js'
import type {
  CarrierIdentity,
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  RecordOccurrenceMailInput,
  SendOccurrenceMailResult,
} from '../../src/occurrence-conversation/application/occurrence-mail.port.js'
import { createSendOccurrenceChatMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-chat-mail.use-case.js'
import type {
  ResolvedStandardEmailTemplate,
  StandardEmailInput,
  StandardEmailRendered,
} from '../../src/occurrence-conversation/application/standard-email-renderer.port.js'
import { buildChatMailSubject } from '../../src/occurrence-conversation/domain/occurrence-chat-mail-subject.policy.js'
import { SEND_OCCURRENCE_CHAT_MAIL_OPERATION } from '../../src/occurrence-conversation/domain/occurrence-conversation.constant.js'
import {
  OccurrenceChatMailNoRecipientsError,
  OccurrenceChatMailNotConfiguredError,
  OccurrenceChatMailTooLargeError,
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationMailInvalidError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000274601'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000274602'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000274603'
const ACTOR_ID = '00000000-0000-4000-8000-000000274604'
const UPLOAD_ID = '00000000-0000-4000-8000-0000002746a1'
const PDF = new TextEncoder().encode('%PDF-1.7 nota')
const RESOLVED_TEMPLATE = { resolvedTemplate: true } as unknown as ResolvedStandardEmailTemplate
const NOW = new Date('2026-10-19T12:00:00.000Z')

const CARRIER: CarrierIdentity = {
  city: 'Ribeirão Preto',
  cnpj: '11444777000161',
  displayName: 'Transportadora Sintética',
  hasLogo: true,
  legalName: 'Transportadora Sintética Ltda',
  state: 'SP',
}
const PREFIX = 'Transportadora Sintética · CNPJ 11.444.777/0001-61 — '
const TARGET: OccurrenceMailTarget = {
  contractorId: CONTRACTOR_ID,
  contractorName: 'Contratante Alfa',
  contractorTaxId: '11222333000181',
  kind: 'document',
  occurrenceTypeId: '00000000-0000-4000-8000-000000274605',
  stage: 'delivery',
}
const CANDIDATES = [
  {
    email: 'compras@alfa.example.test',
    id: 'contact-1',
    name: 'Compras',
    occurrenceStages: ['delivery'],
    roleLabel: 'Compras',
    types: [],
  },
  {
    email: 'outro@alfa.example.test',
    id: 'contact-2',
    name: 'Outro',
    occurrenceStages: ['separation'],
    roleLabel: 'Outro',
    types: [],
  },
] as const

function rendered(overrides: Partial<StandardEmailRendered> = {}): StandardEmailRendered {
  return {
    bytes: 1200,
    html: '<p>padrão</p>',
    template: { key: 'notification.standard-email', source: 'builtin', version: 0 },
    text: 'padrão',
    tooLarge: false,
    ...overrides,
  }
}

function createFake(
  overrides: Partial<{
    candidates: typeof CANDIDATES | readonly never[]
    chosen: readonly string[]
    facts: { invoiceNumber: null | string; lastOutboundSubject: null | string; typeName: string }
    portalAudience: { email: string; userId: string }[] | null
    render: StandardEmailRendered
    settings: Awaited<ReturnType<OccurrenceMailTransactionPort['findMailSettings']>>
    target: OccurrenceMailTarget | null
    watchers: { address: string; name: string; userId: string }[]
  }> = {},
) {
  const state = {
    conversationMessages: [] as { attachments?: never; bodyText: string }[],
    idempotency: new Map<
      string,
      { fingerprint: string; operation: string | undefined; response: SendOccurrenceMailResult }
    >(),
    mails: [] as RecordOccurrenceMailInput[],
    notices: [] as unknown[],
    renders: [] as { input: StandardEmailInput; template: unknown }[],
    resolves: [] as string[],
    steps: [] as string[],
  }
  const transaction = {
    attachments: {
      attachUpload: async () => undefined,
      lockPendingUploads: async (params: { ids: readonly string[] }) =>
        params.ids.map((id) => ({
          bucket: 'bucket',
          declaredContentType: 'application/pdf',
          expiresAt: new Date(NOW.getTime() + 60_000),
          fileName: 'nota.pdf',
          id,
          objectKey: `key-${id}`,
        })),
    },
    async findCarrierIdentity() {
      return CARRIER
    },
    async findChatMailSubjectFacts() {
      state.steps.push('facts')
      return (
        overrides.facts ?? { invoiceNumber: '4512', lastOutboundSubject: null, typeName: 'Recusa' }
      )
    },
    async findChosenOccurrenceRecipientIds() {
      return overrides.chosen ?? []
    },
    async findIdempotency({
      idempotencyKey,
      operation,
    }: {
      idempotencyKey: string
      operation?: string
    }) {
      state.steps.push('replay')
      const found = state.idempotency.get(`${operation ?? ''}:${idempotencyKey}`)
      return found === undefined
        ? null
        : { fingerprint: found.fingerprint, response: found.response }
    },
    async findMailSettings() {
      state.steps.push('readiness')
      return 'settings' in overrides
        ? overrides.settings
        : {
            id: 'settings-1',
            secretEnvelope: {},
            senderAddress: 'ocorrencias@transportadora.example.test',
            sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
          }
    },
    async findOccurrenceContacts({ contactIds }: { contactIds: readonly string[] }) {
      return CANDIDATES.filter((candidate) => contactIds.includes(candidate.id)).map((c) => ({
        email: c.email,
        id: c.id,
      }))
    },
    async findOccurrenceTarget() {
      return 'target' in overrides ? (overrides.target ?? null) : TARGET
    },
    async findOccurrenceThread() {
      return undefined
    },
    async findOperatorSigner() {
      return { jobTitle: 'Operação', name: 'Operadora Lima' }
    },
    async findOrCreateContractorConversation() {
      return { id: 'conversation-1' }
    },
    async listOccurrenceRecipients() {
      state.steps.push('recipients')
      return overrides.candidates ?? CANDIDATES
    },
    async loadWatcherCandidates() {
      return {
        company: (overrides.watchers ?? []).map((watcher) => ({ ...watcher })),
        contractor: [],
        type: [],
      }
    },
    async lockOccurrenceThread() {},
    async recordConversationMessage(params: { bodyText: string }) {
      state.conversationMessages.push(params)
      return { id: 'conversation-message-1' }
    },
    async recordMail(params: RecordOccurrenceMailInput) {
      state.steps.push('record')
      state.mails.push(params)
      return { messageId: 'mail-message-1' }
    },
    async saveIdempotency(params: {
      fingerprint: string
      idempotencyKey: string
      operation?: string
      response: SendOccurrenceMailResult
    }) {
      state.idempotency.set(`${params.operation ?? ''}:${params.idempotencyKey}`, {
        fingerprint: params.fingerprint,
        operation: params.operation,
        response: params.response,
      })
    },
  } as unknown as OccurrenceMailTransactionPort
  const notice = createContractorPortalChatNotice({
    audienceReader: {
      find: async () =>
        'portalAudience' in overrides && overrides.portalAudience === null
          ? null
          : {
              occurrenceLabel: 'NF 4512',
              users: overrides.portalAudience ?? [
                { email: 'compras@alfa.example.test', userId: 'portal-1' },
                { email: 'diretoria@alfa.example.test', userId: 'portal-2' },
              ],
            },
    },
    notifier: { notify: async (params) => void state.notices.push(params) },
  })
  const build = (withRenderer = true) =>
    createSendOccurrenceChatMailUseCase({
      appBaseUrl: 'https://painel.example.test/',
      fingerprintService: {
        create: async ({ fields, operation }) =>
          `${operation}|${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
      },
      now: () => NOW,
      portalNotice: notice,
      ...(withRenderer
        ? {
            renderer: {
              render: (params) => {
                state.steps.push('render')
                state.renders.push(params)
                return overrides.render ?? rendered()
              },
              resolve: async ({ companyId }) => {
                state.steps.push('resolve')
                state.resolves.push(companyId)
                return RESOLVED_TEMPLATE
              },
            },
          }
        : {}),
      secretService: {
        decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'a'.repeat(64) }),
      } as never,
      storage: {
        createSignedDownload: async () => new URL('https://s3.test/x'),
        createSignedUpload: async () => new URL('https://s3.test/x?upload'),
        deleteObject: async () => undefined,
        getObjectStream: async () => new Blob([PDF]).stream(),
        headObject: async () => ({ contentLength: PDF.byteLength }),
        storeObject: async () => undefined,
      },
      unitOfWork: {
        execute: (operation) => {
          state.steps.push('transaction')
          return operation(transaction)
        },
      },
    })
  return { state, useCase: build(), withoutRenderer: build(false) }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: ACTOR_ID,
    bodyText: '  Boa tarde, segue a nota.  ',
    companyId: COMPANY_ID,
    correlationId: 'correlation-1',
    idempotencyKey: 'email-message:abc',
    occurrenceId: OCCURRENCE_ID,
    ...overrides,
  }
}

async function failure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error) {
    return error
  }
  throw new Error('EXPECTED_FAILURE')
}

describe('o chat por e-mail (spec 274 T3.6)', () => {
  test('sem modelo do tipo envia: grava e-mail, mensagem na fila e a versão do modelo padrão (0 = embutido)', async () => {
    const { state, useCase } = createFake()

    const result = await useCase.send(input())

    expect(result).toEqual({
      conversationId: 'conversation-1',
      conversationMessageId: 'conversation-message-1',
      mailMessageId: 'mail-message-1',
      recipientCount: 1,
      threadId: expect.any(String),
    })
    const [mail] = state.mails
    expect(mail).toMatchObject({
      actorUserId: ACTOR_ID,
      bodyHtml: '<p>padrão</p>',
      bodyText: 'padrão',
      hasInlineLogo: true,
      notificationTemplate: { key: 'notification.standard-email', version: 0 },
      subject: `${PREFIX}Ocorrência Recusa — NF 4512`,
      toAddresses: ['compras@alfa.example.test'],
    })
    expect(state.conversationMessages[0]?.bodyText).toBe('Boa tarde, segue a nota.')
  })

  test('grava a versão da empresa quando o renderer devolve o modelo dela', async () => {
    const { state, useCase } = createFake({
      render: rendered({
        template: { key: 'notification.standard-email', source: 'company', version: 3 },
      }),
    })
    await useCase.send(input())
    expect(state.mails[0]?.notificationTemplate).toEqual({
      key: 'notification.standard-email',
      version: 3,
    })
  })

  test('monta só texto: identidade com logo cid, assinante com cargo, anexos, rodapé e dica de resposta', async () => {
    const { state, useCase } = createFake()
    await useCase.send(input({ attachmentIds: [UPLOAD_ID] }))

    expect(state.renders).toEqual([
      {
        template: RESOLVED_TEMPLATE,
        input: {
          attachments: [{ name: 'nota.pdf' }],
          bodyText: 'Boa tarde, segue a nota.',
          footer: {
            platformMarkUrl: 'https://painel.example.test/icons/ada-technology.png',
            platformNote: 'Enviado pelo TransportAdA — uma solução Ada Technology',
            productMarkUrl: 'https://painel.example.test/icons/icon-192.png',
          },
          identity: {
            displayName: 'Transportadora Sintética',
            logo: { contentId: 'company-logo', kind: 'cid' },
          },
          replyHint: expect.stringContaining('Responda este e-mail'),
          signer: { name: 'Operadora Lima', role: 'Operação' },
        },
      },
    ])
  })

  test('a ordem: o modelo é resolvido ANTES da transação; dentro dela só o render puro, depois de replay, prontidão e destinatários', async () => {
    const { state, useCase } = createFake()
    await useCase.send(input())
    expect(state.resolves).toEqual([COMPANY_ID])
    expect(state.steps).toEqual([
      'resolve',
      'transaction',
      'replay',
      'readiness',
      'recipients',
      'render',
      'facts',
      'record',
    ])
  })

  test('só com anexo o texto vai vazio: o corpo da conversa fica vazio e o modelo renderiza com corpo vazio', async () => {
    const { state, useCase } = createFake()
    await useCase.send(input({ attachmentIds: [UPLOAD_ID], bodyText: '   ' }))
    expect(state.renders[0]?.input.bodyText).toBe('')
    expect(state.renders[0]?.input.attachments).toEqual([{ name: 'nota.pdf' }])
    expect(state.conversationMessages[0]?.bodyText).toBe('')
    expect(state.mails).toHaveLength(1)
  })

  test('sem anexo o texto vazio segue 422 e nada é resolvido nem gravado', async () => {
    const { state, useCase } = createFake()
    expect(await failure(() => useCase.send(input({ bodyText: '  ' })))).toBeInstanceOf(
      OccurrenceConversationMailInvalidError,
    )
    expect(state.steps).toEqual([])
    expect(state.mails).toEqual([])
  })

  test('o assunto é o do último e-mail de saída que não é encaminhamento, sem "Re:"', async () => {
    const { state, useCase } = createFake({
      facts: {
        invoiceNumber: '4512',
        lastOutboundSubject: `${PREFIX}Recusa — NF 4512`,
        typeName: 'x',
      },
    })
    await useCase.send(input())
    expect(state.mails[0]?.subject).toBe(`${PREFIX}Recusa — NF 4512`)
  })

  test('sem pré-marcado é 409 OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS e nada é renderizado nem gravado', async () => {
    const { state, useCase } = createFake({ candidates: [] })
    expect(await failure(() => useCase.send(input()))).toBeInstanceOf(
      OccurrenceChatMailNoRecipientsError,
    )
    expect(state.renders).toEqual([])
    expect(state.mails).toEqual([])
  })

  test('tooLarge é 400 e nada é gravado', async () => {
    const { state, useCase } = createFake({ render: rendered({ tooLarge: true }) })
    expect(await failure(() => useCase.send(input()))).toBeInstanceOf(
      OccurrenceChatMailTooLargeError,
    )
    expect(state.mails).toEqual([])
  })

  test('ocorrência de outra empresa (alvo ausente) é 404', async () => {
    const { useCase } = createFake({ target: null })
    expect(await failure(() => useCase.send(input()))).toBeInstanceOf(TripOccurrenceNotFoundError)
  })

  test('sem o renderer ligado responde erro de configuração explícito, sem gravar', async () => {
    const { state, withoutRenderer } = createFake()
    expect(await failure(() => withoutRenderer.send(input()))).toBeInstanceOf(
      OccurrenceChatMailNotConfiguredError,
    )
    expect(state.mails).toEqual([])
  })

  test('idempotência: a mesma chave e o mesmo conteúdo devolvem a resposta gravada, sem segundo e-mail nem aviso', async () => {
    const { state, useCase } = createFake()
    const first = await useCase.send(input())
    const noticesAfterFirst = state.notices.length
    const second = await useCase.send(input())

    expect(second).toEqual(first)
    expect(state.mails).toHaveLength(1)
    expect(state.notices).toHaveLength(noticesAfterFirst)
    expect([...state.idempotency.keys()]).toEqual([
      `${SEND_OCCURRENCE_CHAT_MAIL_OPERATION}:email-message:abc`,
    ])
  })

  test('a mesma chave com outro texto ou outros anexos é 409', async () => {
    const { useCase } = createFake()
    await useCase.send(input())
    expect(await failure(() => useCase.send(input({ bodyText: 'Outro texto' })))).toBeInstanceOf(
      OccurrenceConversationIdempotencyKeyReusedError,
    )
    expect(await failure(() => useCase.send(input({ attachmentIds: [UPLOAD_ID] })))).toBeInstanceOf(
      OccurrenceConversationIdempotencyKeyReusedError,
    )
  })

  test('o portal só é avisado dos que não estão em To/Cc, depois do commit', async () => {
    const { state, useCase } = createFake()
    await useCase.send(input())
    expect(state.notices).toEqual([
      {
        companyId: COMPANY_ID,
        messageId: 'conversation-message-1',
        occurrenceLabel: 'NF 4512',
        recipientUserIds: ['portal-2'],
      },
    ])
  })

  test('portal indisponível no chat é sem aviso, nunca erro', async () => {
    const { state, useCase } = createFake({ portalAudience: null })
    await useCase.send(input())
    expect(state.notices).toEqual([])
  })
})

describe('o assunto do chat (spec 274 D6)', () => {
  const carrier = { cnpj: CARRIER.cnpj, displayName: CARRIER.displayName }
  test('com e-mail anterior: o assunto dele, sem acrescentar "Re:" nem prefixar de novo', () => {
    expect(
      buildChatMailSubject({
        carrier,
        invoiceNumber: '1',
        lastOutboundSubject: 'Assunto antigo',
        typeName: 'Recusa',
      }),
    ).toBe('Assunto antigo')
  })

  test('sem anterior: Ocorrência <tipo> — NF <n> com o prefixo da 272, idempotente', () => {
    const subject = buildChatMailSubject({
      carrier,
      invoiceNumber: '4512',
      lastOutboundSubject: null,
      typeName: 'Recusa',
    })
    expect(subject).toBe(`${PREFIX}Ocorrência Recusa — NF 4512`)
    expect(
      buildChatMailSubject({
        carrier,
        invoiceNumber: '4512',
        lastOutboundSubject: subject,
        typeName: 'Recusa',
      }),
    ).toBe(subject)
  })

  test('sem tipo (vazio) o assunto não leva espaço duplo: "Ocorrência — NF 123"', () => {
    expect(
      buildChatMailSubject({
        carrier: undefined,
        invoiceNumber: '123',
        lastOutboundSubject: null,
        typeName: '  ',
      }),
    ).toBe('Ocorrência — NF 123')
    expect(
      buildChatMailSubject({
        carrier: undefined,
        invoiceNumber: null,
        lastOutboundSubject: null,
        typeName: '',
      }),
    ).toBe('Ocorrência')
  })

  test('sem perfil fiscal o assunto também sai limpo (controles, invisíveis, quebra de linha) e cortado em 200', () => {
    expect(
      buildChatMailSubject({
        carrier: undefined,
        invoiceNumber: '1\r\nBcc: x@evil.test',
        lastOutboundSubject: null,
        typeName: 'Re\u200Bcusa\u0007',
      }),
    ).toBe('Ocorrência Recusa — NF 1 Bcc: x@evil.test')
    const long = buildChatMailSubject({
      carrier: undefined,
      invoiceNumber: '1',
      lastOutboundSubject: null,
      typeName: 'x'.repeat(500),
    })
    expect(long.length).toBeLessThanOrEqual(200)
  })

  test('o assunto do último e-mail também é limpo e cortado', () => {
    const subject = buildChatMailSubject({
      carrier: undefined,
      invoiceNumber: null,
      lastOutboundSubject: `a\nb${'y'.repeat(400)}`,
      typeName: 'x',
    })
    expect(subject.startsWith('a b')).toBe(true)
    expect(subject.length).toBeLessThanOrEqual(200)
  })

  test('sem perfil fiscal ou sem número da nota, ainda monta o assunto', () => {
    expect(
      buildChatMailSubject({
        carrier: undefined,
        invoiceNumber: null,
        lastOutboundSubject: '  ',
        typeName: 'Recusa',
      }),
    ).toBe('Ocorrência Recusa')
  })
})

describe('a seleção do aviso do portal continua a da T3.7', () => {
  test('quem está em To/Cc, em qualquer caixa, não é avisado', () => {
    expect(
      selectPortalChatNoticeRecipients(
        [
          { email: 'a@x.test', userId: 'u1' },
          { email: 'b@x.test', userId: 'u2' },
        ],
        ['A@X.test'],
      ),
    ).toEqual(['u2'])
  })
})
