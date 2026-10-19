/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import enLocale from '../../src/modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json'
import ptLocale from '../../src/modules/occurrence-conversation/locales/occurrenceConversation.locale.json'
import {
  resolveContractorChatError,
  resolveContractorComposer,
} from '../../src/modules/occurrence-conversation/shared/contractorChat.service'
import { createOccurrenceThreadApi } from '../../src/modules/occurrence-conversation/shared/occurrenceThreadApi.service'

function failingApi(code: string, onSendError: (error: unknown) => void) {
  return createOccurrenceThreadApi({
    client: {
      markConversationRead: () => Promise.resolve(),
      putConversationUpload: () => Promise.resolve(),
      requestConversationUpload: () =>
        Promise.resolve({ uploadId: 'u', uploadUrl: 'https://s.test/u' }),
      sendContractorChatMessage: () => Promise.reject(Object.assign(new Error(code), { code })),
      sendDriverAppMessage: () => Promise.resolve(),
    },
    labels: {} as never,
    occurrenceId: 'occurrence-1',
    onChanged: () => undefined,
    onSendError,
    participant: 'contractor',
    readConversations: () =>
      Promise.resolve({ contractorPortal: { available: false }, conversations: [] }),
    subscribe: () => () => undefined,
  })
}

describe('chat da contratante por e-mail (spec 274 T5)', () => {
  test('composer aberto com nota + contratante + permissão, com ou sem portal', () => {
    expect(
      resolveContractorComposer({ canSend: true, contractorId: 'c', hasDocument: true }),
    ).toEqual({
      canWrite: true,
      status: 'open',
    })
    for (const input of [
      { canSend: false, contractorId: 'c', hasDocument: true },
      { canSend: true, contractorId: null, hasDocument: true },
      { canSend: true, contractorId: 'c', hasDocument: false },
    ]) {
      expect(resolveContractorComposer(input)).toEqual({ canWrite: false, status: 'closed' })
    }
  })

  test('erros mapeados para o motivo', () => {
    expect(resolveContractorChatError('OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS')).toBe('noRecipients')
    expect(resolveContractorChatError('CONTRACTOR_MAIL_NOT_CONFIGURED')).toBe('notConfigured')
    expect(resolveContractorChatError('CONTRACTOR_MAIL_SENDING_NOT_VERIFIED')).toBe('notVerified')
    expect(resolveContractorChatError('OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED')).toBe(
      'generic',
    )
    expect(resolveContractorChatError(undefined)).toBe('generic')
  })

  test('as falhas próprias do chat têm motivo próprio, nunca genérico (grande demais, não ligado, teto)', () => {
    expect(resolveContractorChatError('OCCURRENCE_CHAT_MAIL_TOO_LARGE')).toBe('tooLarge')
    expect(resolveContractorChatError('OCCURRENCE_CHAT_MAIL_NOT_CONFIGURED')).toBe(
      'chatUnavailable',
    )
    expect(resolveContractorChatError('OCCURRENCE_CHAT_MAIL_RATE_LIMITED')).toBe('rateLimited')
  })

  test('cada motivo tem texto em pt-BR e em inglês', () => {
    const kinds = [
      'chatUnavailable',
      'generic',
      'noRecipients',
      'notConfigured',
      'notVerified',
      'rateLimited',
      'tooLarge',
    ]
    for (const locale of [ptLocale, enLocale]) {
      const sendError = (locale as { thread: { sendError: Record<string, string> } }).thread
        .sendError
      for (const kind of kinds) expect(sendError[kind]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  test('só com anexo (ou áudio) o painel manda body vazio e anexo, sem texto inventado', async () => {
    const sent: { attachmentIds: readonly string[]; body: string }[] = []
    const api = createOccurrenceThreadApi({
      client: {
        markConversationRead: () => Promise.resolve(),
        putConversationUpload: () => Promise.resolve(),
        requestConversationUpload: () =>
          Promise.resolve({ uploadId: 'upload-1', uploadUrl: 'https://s.test/u' }),
        sendContractorChatMessage: (message: {
          attachmentIds?: readonly string[]
          body: string
        }) => {
          sent.push({ attachmentIds: message.attachmentIds ?? [], body: message.body })
          return Promise.resolve()
        },
        sendDriverAppMessage: () => Promise.resolve(),
      },
      labels: {} as never,
      occurrenceId: 'occurrence-1',
      onChanged: () => undefined,
      onSendError: () => undefined,
      participant: 'contractor',
      readConversations: () =>
        Promise.resolve({ contractorPortal: { available: false }, conversations: [] }),
      subscribe: () => () => undefined,
    })
    await api.sendMessage({
      clientMessageId: 'c2',
      files: [new File(['x'], 'nota.pdf', { type: 'application/pdf' })],
      subject: { subjectId: 's', subjectType: 't' },
    })
    expect(sent).toEqual([{ attachmentIds: ['upload-1'], body: '' }])
  })

  test('falha do envio chega ao painel com código e texto, e a exceção segue para o SDK', async () => {
    const onSendError = mock<(error: unknown) => void>()
    const api = failingApi('OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS', onSendError)
    let thrown: unknown
    try {
      await api.sendMessage({
        clientMessageId: 'c1',
        subject: { subjectId: 's', subjectType: 't' },
        text: 'Olá',
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(onSendError).toHaveBeenCalledWith({
      code: 'OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS',
      text: 'Olá',
    })
  })
})
