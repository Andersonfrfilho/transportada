/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T903 (achados F2 e F3): o que o compositor faz depois de um envio que falhou.
 *
 * - F2: o upload do rascunho vale 15 min. Reenviar depois disso com o mesmo id dava
 *   `UPLOAD_INVALID` para sempre; a falha limpa o que já subiu e a próxima tentativa sobe de novo.
 * - F3: a API gravou, a resposta se perdeu e a pessoa editou o texto — a mesma chave com outro
 *   conteúdo dá `IDEMPOTENCY_KEY_REUSED` para sempre. A falha troca a chave e diz que a anterior já
 *   foi registrada.
 * - Qualquer outra falha mantém chave e uploads: o reenvio é o mesmo envio.
 */
import { describe, expect, test } from 'bun:test'

import { OccurrenceConversationRequestError } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import { recoverFromSendFailure } from '@/modules/occurrence-conversation/shared/conversationAttachment.service'

describe('depois de um envio que falhou (spec 183 T903, F2/F3)', () => {
  test('upload vencido: limpa o que subiu, a chave fica', () => {
    expect(
      recoverFromSendFailure(
        new OccurrenceConversationRequestError('OCCURRENCE_CONVERSATION_UPLOAD_INVALID'),
      ),
    ).toEqual({ clearUploads: true, reason: 'uploadExpired', renewKey: false })
  })

  test('chave reusada com outro conteúdo: chave nova e o aviso de que a anterior foi registrada', () => {
    expect(
      recoverFromSendFailure(
        new OccurrenceConversationRequestError('OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED'),
      ),
    ).toEqual({ clearUploads: true, reason: 'alreadySent', renewKey: true })
  })

  test('outra falha (rede, servidor): o reenvio é o mesmo envio', () => {
    expect(recoverFromSendFailure(new Error('network'))).toEqual({
      clearUploads: false,
      reason: 'generic',
      renewKey: false,
    })
  })
})
