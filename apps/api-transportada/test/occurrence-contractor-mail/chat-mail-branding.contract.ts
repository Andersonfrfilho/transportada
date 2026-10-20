import { describe, expect, test } from 'bun:test'
import {
  brandChatMail,
  CHAT_MAIL_FOOTER_PLACEHOLDER,
} from '../../src/occurrence-conversation/domain/occurrence-chat-mail-branding.policy.js'
import { buildFooterMarks } from '../../src/occurrence-conversation/domain/occurrence-mail-system-html.policy.js'

describe('chat da contratante: marcas do rodapé', () => {
  const html = `<img src="cid:company-logo" alt="x"><div>${CHAT_MAIL_FOOTER_PLACEHOLDER}</div><div></div>`

  test('o texto do rodapé é trocado pelas marcas ao lado dos nomes, no HTML e no texto', () => {
    const footerHtml = buildFooterMarks('https://app.example.test')
    const out = brandChatMail({
      footerHtml,
      footerText: 'Enviado pelo TransportAdA — uma solução Ada Technology',
      html,
      text: `Oi\n${CHAT_MAIL_FOOTER_PLACEHOLDER}`,
    })

    expect(out.html).not.toContain(CHAT_MAIL_FOOTER_PLACEHOLDER)
    expect(out.html.indexOf('icon-192.png')).toBeLessThan(out.html.indexOf('TransportAdA'))
    expect(out.html.indexOf('ada-technology.png')).toBeLessThan(out.html.indexOf('Ada Technology'))
    expect(out.html).not.toContain('margin:0 auto')
    expect(out.text).toBe('Oi\nEnviado pelo TransportAdA — uma solução Ada Technology')
  })

  test('com endereço público o cid do logo vira src, escapado; sem ele o cid fica', () => {
    const withUrl = brandChatMail({
      footerHtml: '',
      footerText: '',
      html,
      logoUrl: 'https://a.test/l"x',
      text: '',
    })
    const without = brandChatMail({ footerHtml: '', footerText: '', html, text: '' })

    expect(withUrl.html).toContain('src="https://a.test/l&quot;x"')
    expect(withUrl.html).not.toContain('cid:')
    expect(without.html).toContain('src="cid:company-logo"')
  })
})

describe('nomes do e-mail da ocorrência', () => {
  test('o nome gravado em minúsculas sai com iniciais maiúsculas', async () => {
    const { toDisplayPersonName } = await import('../../src/shared/person-name.service.js')

    expect(toDisplayPersonName('anderson fernandes r filho')).toBe('Anderson Fernandes R Filho')
    expect(toDisplayPersonName('andréia ulisses procopio')).toBe('Andréia Ulisses Procopio')
  })
})

describe('chat da contratante: largura fluida', () => {
  const html =
    '<table width="620" style="width:620px;max-width:620px"><tr><td style="padding:0 24px 12px"></td></tr><tr><td>oi</td></tr></table>'
  const branded = brandChatMail({ footerHtml: '', footerText: '', html, text: '' }).html

  test('troca a largura fixa por 100% e mantém o máximo', () => {
    expect(branded).toContain('width="100%"')
    expect(branded).toContain('width:100%;max-width:620px')
    expect(branded).not.toContain('620px;max')
  })

  test('remove as linhas vazias', () => {
    expect(branded).not.toContain('padding:0 24px 12px')
    expect(branded).toContain('oi')
  })
})
