/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o MIME do encaminhamento é lido com PostalMime limitado (profundidade, cabeçalhos) e a
 * mensagem anexada é aberta UMA vez, sem recursão. Só o que a política do ramo precisa sai daqui:
 * o `From` de fora, o remetente original e os anexos candidatos.
 */
import { describe, expect, test } from 'bun:test'

import { parseForwardedEmail } from '../../src/cargo-preview-email/application/parse-forwarded-email.service.js'
import { buildMime, buildOriginalMime, gmailForwardText, WORKBOOK_BYTES } from './mime.fixture.js'

const enc = (value: string) => new TextEncoder().encode(value)
const FORWARDER = 'equipe@transportadora.example'
const ORIGINAL = 'fr@contratante.example'

describe('a leitura do e-mail encaminhado (spec 237 T4.6)', () => {
  test('encaminhamento inline: o From de fora, o bloco do texto e o anexo de fora', async () => {
    const raw = buildMime({
      attachments: [{ fileName: 'FR-06-10.xlsm' }],
      from: `Equipe <${FORWARDER}>`,
      text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
    })
    const parsed = await parseForwardedEmail(enc(raw))
    expect(parsed?.forwarderAddress).toBe(FORWARDER)
    expect(parsed?.originalSender).toEqual({ address: ORIGINAL, kind: 'found' })
    expect(parsed?.attachments).toHaveLength(1)
    expect(parsed?.attachments[0]?.fileName).toBe('FR-06-10.xlsm')
    expect(Array.from(parsed?.attachments[0]?.bytes ?? [])).toEqual(Array.from(WORKBOOK_BYTES))
  })

  test('encaminhamento como anexo: o remetente e a planilha vêm da mensagem anexada', async () => {
    const raw = buildMime({
      attachments: [],
      forwardedMessages: [buildOriginalMime({ from: `FR <${ORIGINAL}>` })],
      from: FORWARDER,
      text: 'segue em anexo',
    })
    const parsed = await parseForwardedEmail(enc(raw))
    expect(parsed?.originalSender).toEqual({ address: ORIGINAL, kind: 'found' })
    expect(parsed?.attachments.map((item) => item.fileName)).toEqual(['FR-06-10.xlsm'])
  })

  test('com mensagem anexada, o bloco do texto de fora não decide o remetente', async () => {
    const raw = buildMime({
      forwardedMessages: [buildOriginalMime({ from: ORIGINAL })],
      from: FORWARDER,
      text: gmailForwardText({ from: 'mallory@evil.example' }),
    })
    expect((await parseForwardedEmail(enc(raw)))?.originalSender).toEqual({
      address: ORIGINAL,
      kind: 'found',
    })
  })

  test('duas mensagens anexadas são ambíguas', async () => {
    const original = buildOriginalMime({ from: ORIGINAL })
    const raw = buildMime({ forwardedMessages: [original, original], from: FORWARDER })
    expect((await parseForwardedEmail(enc(raw)))?.originalSender).toEqual({ kind: 'ambiguous' })
  })

  test('From duplicado na mensagem anexada é ambíguo', async () => {
    const forged = buildOriginalMime({
      extraHeaders: [`From: mallory@evil.example`],
      from: ORIGINAL,
    })
    const raw = buildMime({ forwardedMessages: [forged], from: FORWARDER })
    expect((await parseForwardedEmail(enc(raw)))?.originalSender).toEqual({ kind: 'ambiguous' })
  })

  test('uma mensagem dentro da mensagem anexada nunca é aberta nem vira candidata', async () => {
    const inner = buildMime({ boundary: 'nested', from: 'nested@contratante.example' })
    const original = buildOriginalMime({
      attachments: [{ fileName: 'FR-06-10.xlsm' }],
      from: ORIGINAL,
    }).replace(
      '--b-inner-xxxxxxxx--',
      `--b-inner-xxxxxxxx\r\nContent-Type: message/rfc822\r\n\r\n${inner}\r\n--b-inner-xxxxxxxx--`,
    )
    const raw = buildMime({ forwardedMessages: [original], from: FORWARDER })
    const parsed = await parseForwardedEmail(enc(raw))
    const readable = parsed?.attachments.filter((item) => item.mimeType !== 'message/rfc822')
    expect(readable?.map((item) => item.fileName)).toEqual(['FR-06-10.xlsm'])
    expect(parsed?.originalSender).toEqual({ address: ORIGINAL, kind: 'found' })
  })

  test('multipart aninhado além da profundidade é ilegível, não um estouro', async () => {
    const depth = 60
    const open = Array.from({ length: depth }, (_, index) => `--n${index}`).join('\r\n')
    const types = Array.from(
      { length: depth },
      (_, index) =>
        `Content-Type: multipart/mixed; boundary="n${index + 1}"\r\n\r\n--n${index + 1}\r\n`,
    ).join('')
    const raw = `From: ${FORWARDER}\r\nTo: x@y.example\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="n0"\r\n\r\n--n0\r\n${types}${open}\r\n`
    expect(await parseForwardedEmail(enc(raw))).toBeUndefined()
  })

  test('cabeçalhos além do teto são ilegíveis', async () => {
    const huge = `X-Lixo: ${'a'.repeat(70 * 1024)}`
    const raw = buildMime({ extraHeaders: [huge], from: FORWARDER })
    expect(await parseForwardedEmail(enc(raw))).toBeUndefined()
  })

  test('bytes que não são e-mail não dão remetente de fora', async () => {
    const parsed = await parseForwardedEmail(new Uint8Array([0, 1, 2, 3, 4, 5]))
    expect(parsed?.forwarderAddress).toBeUndefined()
  })
})
