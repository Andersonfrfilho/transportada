/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { renderCodeEmail } from '../../src/identity/domain/code-email-template.service.js'

const SUBJECT = 'Seu acesso ao TransportAdA'

const EMPTY_BRAND = {
  accentColor: undefined,
  apiBaseUrl: 'https://api.exemplo.com.br',
  appBaseUrl: undefined,
  contactEmail: undefined,
  contactPhone: undefined,
  logoUrl: undefined,
  name: undefined,
} as const

function buildEmailHtml(input: { readonly body: string; readonly subject: string }): string {
  return renderCodeEmail({
    brand: EMPTY_BRAND,
    content: { code: '123456', headline: input.subject, intro: input.body, note: '' },
    year: 2026,
  }).html
}

/**
 * O corpo do e-mail entrava cru em `<p>${body}</p>`. Com o texto do template editável no painel,
 * isso deixou de ser feio e passou a ser perigoso: um `<` digitado quebra o documento, e uma tag
 * colada de outro lugar viaja para a caixa de todo mundo.
 */
describe('a moldura do e-mail', () => {
  test('escapa o que veio do template', () => {
    const html = buildEmailHtml({ body: '<script>alert(1)</script>', subject: SUBJECT })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('escapa também o assunto, que vai no título', () => {
    const html = buildEmailHtml({ body: 'oi', subject: '<b>promoção</b>' })

    expect(html).toContain('&lt;b&gt;promoção&lt;/b&gt;')
  })

  /** Linha em branco separa parágrafo; quebra simples é `<br>`, como quem digitou espera. */
  test('respeita a quebra de linha de quem escreveu', () => {
    const html = buildEmailHtml({
      body: 'primeiro\nsegunda linha\n\noutro bloco',
      subject: SUBJECT,
    })

    expect(html).toContain('primeiro<br>segunda linha')
    expect((html.match(/font-size:15px/gu) ?? []).length).toBe(2)
  })

  /**
   * Cliente de e-mail não é navegador: o Outlook desenha com o motor do Word e ignora flex e grid, e
   * o Gmail remove `<style>` no encaminhamento.
   */
  test('não usa nada que o cliente de e-mail descarta', () => {
    const html = buildEmailHtml({ body: 'oi', subject: SUBJECT })

    expect(html).not.toContain('<style')
    expect(html).not.toContain('display:flex')
    expect(html).toContain('<table')
  })

  /**
   * ⚠️ Imagem remota chega **bloqueada por padrão**, e é por isso que nenhuma delas carrega
   * informação: sem cadastro de logotipo não existe `<img>` nenhuma, e mesmo com ele o nome da
   * transportadora e a assinatura da Ada continuam em texto ao lado do desenho. Antes a moldura
   * proibia `<img>` por completo — o que a regra protege é a leitura com imagem bloqueada, e é isso
   * que este contrato afirma.
   */
  test('a marca sobrevive com a imagem bloqueada', () => {
    const withoutLogo = buildEmailHtml({ body: 'oi', subject: SUBJECT })

    expect(withoutLogo).not.toContain('<img')
    expect(withoutLogo).toContain('TransportAdA')
    expect(withoutLogo).toContain('Ada Technology')

    const withLogo = renderCodeEmail({
      brand: {
        ...EMPTY_BRAND,
        appBaseUrl: 'https://painel.exemplo.com.br',
        logoUrl: 'https://api.exemplo.com.br/public/landing-logo',
        name: 'Transportes Exemplo',
      },
      content: { code: '123456', headline: SUBJECT, intro: 'oi', note: '' },
      year: 2026,
    }).html

    /* Logotipo é enfeite: o `alt` é vazio de propósito, porque o nome já está escrito ao lado. */
    expect(withLogo).toContain('alt=""')
    expect(withLogo).toContain('Transportes Exemplo')
    expect(withLogo).toContain('Ada Technology')
  })

  test('a marca vai como texto, não como arquivo', () => {
    expect(buildEmailHtml({ body: 'oi', subject: SUBJECT })).toContain('TransportAdA')
  })

  /** Bloco vazio não vira parágrafo vazio: espaço em branco no fim do texto é acidente comum. */
  test('bloco em branco não vira parágrafo', () => {
    const html = buildEmailHtml({ body: 'único\n\n\n\n   ', subject: SUBJECT })

    expect((html.match(/font-size:15px/gu) ?? []).length).toBe(1)
  })
})
