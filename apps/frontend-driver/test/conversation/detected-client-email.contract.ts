/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T4b (RF8): o cartão do e-mail escrito pelo motorista na conversa. O pendente chega só mascarado, forma
 * estranha não vira cartão, e o envio vai pelo id da mensagem com a chave no corpo e `save` só quando pedido.
 */
import { describe, expect, test } from 'bun:test'

import en from '../../src/modules/conversation/locales/conversation.en.locale.json'
import pt from '../../src/modules/conversation/locales/conversation.locale.json'
import {
  createDriverDetectedClientEmailApi,
  isDriverDetectedEmailSent,
  parseDriverDetectedClientEmail,
  parseDriverDetectedEmailOutcome,
} from '../../src/modules/conversation/shared/driverDetectedClientEmail.service'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000279404'
const MESSAGE_ID = '00000000-0000-4000-8000-000000279405'
const BASE = `/me/trips/current/occurrences/${OCCURRENCE_ID}/client-boleto-emails/detected`

describe('o e-mail digitado na conversa no app do motorista (spec 279 T4b)', () => {
  test('lê o pendente mascarado; nada pendente ou forma estranha é null', () => {
    expect(
      parseDriverDetectedClientEmail({
        data: {
          addressMasked: 'f***@m***.com',
          createdAt: '2026-10-26T22:00:00.000Z',
          messageId: MESSAGE_ID,
        },
      }),
    ).toEqual({ addressMasked: 'f***@m***.com', messageId: MESSAGE_ID })
    expect(parseDriverDetectedClientEmail({ data: null })).toBeNull()
    expect(parseDriverDetectedClientEmail({ data: { messageId: MESSAGE_ID } })).toBeNull()
  })

  test('lê e envia pelas rotas do motorista, com a chave no corpo e save só quando pedido', async () => {
    const calls: unknown[] = []
    const reply = {
      data: {
        results: [{ addressMasked: 'f***@m***.com', kind: 'queued', reason: null }],
        savedEmailId: 'e-1',
      },
    }
    const api = createDriverDetectedClientEmailApi({
      deleteJson: () => Promise.resolve({}),
      getJson: (path) => {
        calls.push(['GET', path])
        return Promise.resolve({ data: null })
      },
      patchJson: () => Promise.resolve({}),
      postJson: (path, init) => {
        calls.push(['POST', path, init?.body])
        return Promise.resolve(reply)
      },
      putFile: () => Promise.resolve(),
    })
    expect(await api.read(OCCURRENCE_ID)).toBeNull()
    await api.send({
      idempotencyKey: 'k-1',
      messageId: MESSAGE_ID,
      occurrenceId: OCCURRENCE_ID,
      save: false,
    })
    const saved = await api.send({
      idempotencyKey: 'k-2',
      messageId: MESSAGE_ID,
      occurrenceId: OCCURRENCE_ID,
      save: true,
    })
    expect(saved.savedEmailId).toBe('e-1')
    expect(calls).toEqual([
      ['GET', BASE],
      ['POST', `${BASE}/${MESSAGE_ID}/send`, { idempotencyKey: 'k-1' }],
      ['POST', `${BASE}/${MESSAGE_ID}/send`, { idempotencyKey: 'k-2', save: true }],
    ])
  })

  test('só enviado ou já enviado conta; resposta estranha é erro; os idiomas têm as mesmas chaves', () => {
    const of = (kind: string) => ({ data: { results: [{ addressMasked: 'f***@m***.com', kind }] } })
    expect(isDriverDetectedEmailSent(parseDriverDetectedEmailOutcome(of('already_queued')))).toBe(
      true,
    )
    expect(isDriverDetectedEmailSent(parseDriverDetectedEmailOutcome(of('failed')))).toBe(false)
    expect(() => parseDriverDetectedEmailOutcome(of('sent'))).toThrow()
    expect(Object.keys(en.detectedEmail).toSorted()).toEqual(
      Object.keys(pt.detectedEmail).toSorted(),
    )
  })
})
