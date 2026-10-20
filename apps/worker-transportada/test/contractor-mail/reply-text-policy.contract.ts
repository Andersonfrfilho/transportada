/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { extractReplyText } from '../../src/contractor-mail/domain/reply-text.policy.js'

/**
 * A resposta da contratante entra na conversa só com o texto novo: o histórico citado que o cliente de
 * e-mail anexa embaixo repetiria a conversa inteira em cada mensagem. O e-mail bruto continua no bucket.
 */
describe('extractReplyText', () => {
  test('cuts the Gmail attribution in Portuguese when it wraps over three lines', () => {
    const text = [
      'vamos lá',
      '',
      'Em ter., 20 de out. de 2026 às 08:40, AFR FERNANDES TRANSPORTES E SERVICOS',
      'LTDA <ocorrencias@resposta.staging.fernandes-transportadora.com.br>',
      'escreveu:',
      '[image: AFR FERNANDES TRANSPORTES E SERVICOS LTDA]',
      'Pedido de prorrogação do boleto — NF 899853/2',
    ].join('\n')

    expect(extractReplyText(text)).toBe('vamos lá')
  })

  test('cuts the Gmail attribution when the address wraps onto the next line', () => {
    const text = [
      'segue o boleto',
      '',
      'Em ter., 20 de out. de 2026 às 08:45, Anderson Fernandes <',
      'andersonfrfilho@gmail.com> escreveu:',
      '',
      '> vamos lá',
    ].join('\n')

    expect(extractReplyText(text)).toBe('segue o boleto')
  })

  test('cuts the English attribution', () => {
    const text = [
      'Thanks, attached.',
      '',
      'On Tue, Oct 20, 2026 at 8:40 AM Team <a@b.com> wrote:',
      '> hi',
    ].join('\n')

    expect(extractReplyText(text)).toBe('Thanks, attached.')
  })

  test('cuts the Outlook header block in Portuguese and in English', () => {
    const portuguese = [
      'Segue a planilha.',
      '',
      'De: Equipe <ocorrencias@resposta.exemplo.com.br>',
      'Enviada em: terça-feira, 20 de outubro de 2026 08:40',
      'Para: contato@cliente.com.br',
      'Assunto: Pedido',
    ].join('\n')
    const english = [
      'Ok.',
      '',
      'From: Team <a@b.com>',
      'Sent: Tuesday, October 20, 2026 8:40 AM',
      'To: c@d.com',
    ].join('\n')

    expect(extractReplyText(portuguese)).toBe('Segue a planilha.')
    expect(extractReplyText(english)).toBe('Ok.')
  })

  test('cuts at the Outlook original-message separator', () => {
    const text = ['Recebido.', '', '-----Original Message-----', 'From: x'].join('\n')

    expect(extractReplyText(text)).toBe('Recebido.')
  })

  test('drops trailing quoted lines that come without an attribution', () => {
    const text = ['Pode sim.', '', '> pergunta antiga', '> mais uma linha'].join('\n')

    expect(extractReplyText(text)).toBe('Pode sim.')
  })

  test('keeps a quote the sender wrote in the middle of the new text', () => {
    const text = ['Sobre isto:', '> o boleto venceu', 'já foi pago.'].join('\n')

    expect(extractReplyText(text)).toBe(text)
  })

  test('keeps the whole text when nothing new is left above the quote', () => {
    const text = [
      'Em ter., 20 de out. de 2026 às 08:40, Equipe <a@b.com> escreveu:',
      '> só a citação',
    ].join('\n')

    expect(extractReplyText(text)).toBe(text)
  })

  test('does not cut a line that only starts like an attribution', () => {
    const text = ['Em anexo o boleto do mês.', 'On time delivery confirmed.'].join('\n')

    expect(extractReplyText(text)).toBe(text)
  })

  test('normalizes CRLF line endings', () => {
    expect(extractReplyText('oi\r\n\r\nOn Mon, Jan 1, 2026 Team <a@b.com> wrote:\r\n> x')).toBe(
      'oi',
    )
  })
})
