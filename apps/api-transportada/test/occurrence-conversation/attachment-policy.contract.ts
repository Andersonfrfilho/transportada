/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): a política pura do anexo da conversa. Tipo fechado (PDF, imagem, planilha
 * e o áudio da T705), teto por canal e por tipo (os do WhatsApp são os padrões do
 * `conversations-ui`), até cinco por mensagem, e o tipo conferido pelos **bytes**, nunca pelo nome
 * nem pelo `Content-Type` declarado.
 */
import { describe, expect, test } from 'bun:test'

import {
  CONVERSATION_ATTACHMENTS_PER_MESSAGE,
  checkDeclaredConversationAttachment,
  conversationAttachmentKind,
  matchesConversationAttachmentSignature,
  maxConversationAttachmentBytes,
  normalizeConversationAttachmentFileName,
} from '../../src/occurrence-conversation/domain/conversation-attachment.policy.js'

const MB = 1024 * 1024
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function bytes(...values: readonly (number | string)[]): Uint8Array {
  const out: number[] = []
  for (const value of values) {
    if (typeof value === 'number') out.push(value)
    else for (const char of value) out.push(char.charCodeAt(0))
  }
  return new Uint8Array([...out, ...new Array<number>(32).fill(0x20)])
}

describe('o anexo da conversa — tipo e teto (spec 183 T702a, RF10)', () => {
  test.each([
    ['application/pdf', 'document'],
    ['image/jpeg', 'image'],
    ['image/png', 'image'],
    ['image/webp', 'image'],
    [XLSX, 'document'],
    ['application/vnd.ms-excel', 'document'],
    ['text/csv', 'document'],
    ['audio/ogg', 'audio'],
    ['audio/mpeg', 'audio'],
    ['audio/mp4', 'audio'],
    ['audio/webm', 'audio'],
    ['application/zip', null],
    ['text/html', null],
    ['image/svg+xml', null],
  ] as const)('%s é %s', (contentType, kind) => {
    expect(conversationAttachmentKind(contentType)).toBe(kind)
  })

  test('o teto é do canal e do tipo; o WhatsApp usa os padrões do pacote', () => {
    expect(maxConversationAttachmentBytes('whatsapp', 'image/jpeg')).toBe(5 * MB)
    expect(maxConversationAttachmentBytes('whatsapp', 'application/pdf')).toBe(100 * MB)
    expect(maxConversationAttachmentBytes('whatsapp', 'audio/ogg')).toBe(16 * MB)
    expect(maxConversationAttachmentBytes('app', 'image/jpeg')).toBe(10 * MB)
    expect(maxConversationAttachmentBytes('portal', 'application/pdf')).toBe(25 * MB)
    expect(maxConversationAttachmentBytes('email', 'application/pdf')).toBe(10 * MB)
    expect(CONVERSATION_ATTACHMENTS_PER_MESSAGE).toBe(5)
  })

  test('o declarado fora do tipo, acima do teto ou vazio é recusado antes de subir, com o teto', () => {
    const check = (contentType: string, sizeBytes: number) =>
      checkDeclaredConversationAttachment({ channel: 'app', contentType, sizeBytes })

    expect(check('application/pdf', 1024)).toEqual({ ok: true })
    expect(check('text/html', 1024)).toEqual({ ok: false, reason: 'type' })
    expect(check('application/pdf', 25 * MB + 1)).toEqual({
      maxBytes: 25 * MB,
      ok: false,
      reason: 'size',
    })
    expect(check('application/pdf', 0)).toEqual({ maxBytes: 25 * MB, ok: false, reason: 'size' })
  })
})

describe('o anexo da conversa — assinatura dos bytes (spec 183 T702a, RF10)', () => {
  test.each([
    ['application/pdf', bytes('%PDF-1.7')],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)],
    ['image/webp', bytes('RIFF', 0, 0, 0, 0, 'WEBP')],
    [XLSX, bytes('PK', 0x03, 0x04, 0x14, 0, 0, 0, '[Content_Types].xml', 'xl/workbook.xml')],
    ['application/vnd.ms-excel', bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)],
    ['text/csv', bytes('nota;valor\n4512;180,00\n')],
    ['audio/ogg', bytes('OggS')],
    ['audio/mpeg', bytes('ID3')],
    ['audio/mp4', bytes(0, 0, 0, 0x20, 'ftypM4A ')],
    ['audio/webm', bytes(0x1a, 0x45, 0xdf, 0xa3)],
  ] as const)('%s confere pelos bytes', (contentType, content) => {
    expect(matchesConversationAttachmentSignature(contentType, content)).toBe(true)
  })

  test.each([
    ['PDF declarado com bytes de HTML', 'application/pdf', bytes('<html>')],
    ['imagem declarada com bytes de PDF', 'image/png', bytes('%PDF-1.7')],
    ['planilha declarada com um ZIP qualquer', XLSX, bytes('PK', 0x03, 0x04, 'word/document.xml')],
    ['CSV com byte nulo (binário)', 'text/csv', new Uint8Array([0x61, 0x00, 0x62])],
    ['tipo fora da lista', 'text/html', bytes('<html>')],
  ] as const)('%s é recusado', (_label, contentType, content) => {
    expect(matchesConversationAttachmentSignature(contentType, content)).toBe(false)
  })
})

describe('o nome do arquivo (spec 183 T702a)', () => {
  test.each([
    ['  comprovante.pdf  ', 'comprovante.pdf'],
    ['C:\\\\fotos\\\\canhoto.jpg', 'canhoto.jpg'],
    ['../../etc/passwd', 'passwd'],
    ['', 'anexo'],
    ['nome\u0000oculto.pdf', 'nomeoculto.pdf'],
  ])('%j vira %j', (input, expected) => {
    expect(normalizeConversationAttachmentFileName(input)).toBe(expected)
  })

  test('o nome longo é cortado em 200 caracteres', () => {
    expect(normalizeConversationAttachmentFileName('a'.repeat(300))).toHaveLength(200)
  })
})
