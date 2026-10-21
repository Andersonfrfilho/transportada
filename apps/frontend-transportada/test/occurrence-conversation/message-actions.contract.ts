/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Copiar e encaminhar uma mensagem de um chat da ocorrência ao outro. Para o motorista, cada arquivo vai
 * pela entrega do boleto (o servidor põe o texto "Segue a requisição: <tipo>") e o texto vai como mensagem
 * do app; para a contratante, texto e arquivos vão juntos pelo portal. A chave vem da mensagem: o segundo
 * clique é o mesmo envio.
 */
import { describe, expect, test } from 'bun:test'

import {
  copyableMessageText,
  planMessageForward,
} from '@/modules/occurrence-conversation/shared/messageForward.service'

const PDF = { id: 'att-1' }
const PHOTO = { id: 'att-2' }

describe('ações da mensagem no chat da ocorrência', () => {
  test('copiar leva o texto aparado; mensagem só de arquivo não tem o que copiar', () => {
    expect(copyableMessageText({ text: '  segue o boleto \n' })).toBe('segue o boleto')
    expect(copyableMessageText({ text: null })).toBeNull()
    expect(copyableMessageText({ text: '   ' })).toBeNull()
  })

  test('da contratante ao motorista: cada arquivo pela entrega, o texto pelo app', () => {
    expect(
      planMessageForward({
        from: 'contractor',
        message: { attachments: [PDF, PHOTO], id: 'm1', text: 'Bom dia, segue o boleto' },
      }),
    ).toEqual([
      { attachmentId: 'att-1', kind: 'deliver-attachment-to-driver' },
      { attachmentId: 'att-2', kind: 'deliver-attachment-to-driver' },
      {
        body: 'Bom dia, segue o boleto',
        idempotencyKey: 'message-forward:m1',
        kind: 'driver-text',
      },
    ])
  })

  test('do motorista à contratante: uma mensagem do portal com o texto e os arquivos', () => {
    expect(
      planMessageForward({
        from: 'driver',
        message: { attachments: [PHOTO], id: 'm2', text: null },
        portalAvailable: true,
      }),
    ).toEqual([
      {
        body: '',
        forwardAttachmentIds: ['att-2'],
        idempotencyKey: 'message-forward:m2',
        kind: 'contractor-portal',
      },
    ])
  })

  test('sem portal, o texto do motorista vai pelo chat por e-mail e o arquivo não tem como ir', () => {
    expect(
      planMessageForward({
        from: 'driver',
        message: { attachments: [], id: 'm4', text: 'Cheguei' },
      }),
    ).toEqual([{ body: 'Cheguei', idempotencyKey: 'message-forward:m4', kind: 'contractor-chat' }])
    expect(
      planMessageForward({
        from: 'driver',
        message: { attachments: [PHOTO], id: 'm5', text: 'Foto da avaria' },
      }),
    ).toEqual([])
  })

  test('mensagem vazia não tem o que encaminhar', () => {
    expect(
      planMessageForward({ from: 'driver', message: { attachments: [], id: 'm3', text: ' ' } }),
    ).toEqual([])
  })
})
